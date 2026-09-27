import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

// Sama seperti productSchema di ../route.ts, tapi semua field opsional (PATCH
// parsial) — sengaja tidak diimpor dari route.ts (route segment tidak boleh
// saling impor schema secara langsung di Next.js App Router), didefinisikan
// ulang di sini secara sadar, bukan lupa DRY.
const productPatchSchema = z
  .object({
    part_number: z.string().optional(),
    name: z.string().min(1).optional(),
    category: z.string().optional(),
    unit: z.string().optional(),
    description: z.string().optional(),
    min_threshold: z.number().int().min(0).optional(),
    // Nullable eksplisit sama seperti warranty_days — admin bisa MENGHAPUS
    // nilai ini lagi (balik ke null/default heuristik Monitoring Agent).
    lead_time_days: z.number().int().min(0).max(365).nullable().optional(),
    safety_stock: z.number().int().min(0).nullable().optional(),
    unit_cost: z.number().min(0).optional(),
    selling_price: z.number().min(0).optional(),
    preferred_supplier_id: z.string().uuid().nullable().optional(),
    is_active: z.boolean().optional(),
    // Migration 0028 — nullable eksplisit supaya admin bisa MENGHAPUS garansi
    // (set null lagi), bukan cuma mengisi.
    warranty_days: z.number().int().min(0).max(3650).nullable().optional(),
    // §15.4 — array = REPLACE seluruh aliases produk ini (bukan tambah/hapus
    // satu-satu). undefined = tidak menyentuh aliases sama sekali (klien tidak
    // mengirim field ini). Array kosong [] = sengaja mengosongkan semua alias.
    aliases: z.array(z.string()).optional(),
  })
  .strict();

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireStaff = (permission: Permission = "portal.access") => requireStaffRow(permission);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = productPatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { aliases, ...productData } = parsed.data;
  if (Object.keys(productData).length === 0 && aliases === undefined) {
    return NextResponse.json(
      { error: "Tidak ada field untuk diperbarui" },
      { status: 400 },
    );
  }

  // Guard eksplisit di aplikasi, BUKAN cuma andalkan RLS (§10) — ditemukan
  // lewat penambahan test RLS: RLS `products write full_access` &
  // `product_aliases write via product tenant` sama-sama sudah menolak role
  // 'staff' biasa, TAPI untuk kasus edit aliases-SAJA (productData kosong)
  // jalur lama di sini cuma melakukan SELECT (yang RLS-nya longgar) lalu
  // DELETE product_aliases — dan DELETE yang match 0 baris karena diblok RLS
  // TIDAK melempar error, cuma diam-diam tidak melakukan apa-apa. Staf role
  // 'staff' yang coba kosongkan semua alias akan dapat respons 200 sukses
  // padahal aliases-nya tidak berubah. Guard ini menutup celah itu dengan
  // pesan yang jelas, alih-alih membiarkan RLS gagal diam-diam.
  if (staffRow.role !== "owner" && staffRow.role !== "admin") {
    return NextResponse.json(
      { error: "Hanya owner/admin yang boleh mengubah data produk" },
      { status: 403 },
    );
  }

  // business_id di-scope eksplisit di query (bukan cuma andalkan RLS) — konsisten
  // dengan §4/§10: RLS tetap jadi lapisan terakhir, tapi requireStaff() + filter
  // eksplisit ini yang mencegah row tenant lain kena-touch sama sekali.
  let product;
  if (Object.keys(productData).length > 0) {
    const { data, error } = await supabase
      .from("products")
      .update(productData)
      .eq("id", id)
      .eq("business_id", staffRow.business_id)
      .select()
      .single();

    if (error) {
      logger.error("Gagal update produk", {
        route: "admin/products/[id]",
        business_id: staffRow.business_id,
        product_id: id,
        error,
      });
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    product = data;
  } else {
    // Cuma edit aliases (productData kosong) — tetap wajib verifikasi produk
    // ini memang milik tenant staf ini sebelum sentuh product_aliases-nya,
    // jangan asumsikan dari `id` di URL begitu saja.
    const { data, error } = await supabase
      .from("products")
      .select()
      .eq("id", id)
      .eq("business_id", staffRow.business_id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: "Produk tidak ditemukan di tenant ini" },
        { status: 404 },
      );
    }
    product = data;
  }

  if (aliases !== undefined) {
    // Replace-all, bukan diff tambah/hapus — lebih sederhana buat form UI
    // (satu textarea/tag-input yang dikirim utuh tiap kali submit) dan cukup
    // untuk kebutuhan §15.4. Non-atomic (delete lalu insert terpisah), tapi
    // ini data pelengkap search (getStock/search_products), bukan data
    // finansial — sama toleransinya dengan pola best-effort di POST di atas.
    // Kalau delete sukses tapi insert gagal, aliases produk ini akan KOSONG
    // sampai staf coba simpan ulang — di-log sebagai error supaya ketahuan,
    // bukan gagal diam-diam.
    const { error: deleteError } = await supabase
      .from("product_aliases")
      .delete()
      .eq("product_id", id);
    if (deleteError) {
      logger.error("Gagal menghapus aliases lama saat update produk", {
        route: "admin/products/[id]",
        business_id: staffRow.business_id,
        product_id: id,
        error: deleteError,
      });
      return NextResponse.json(
        { error: "Gagal memperbarui aliases produk" },
        { status: 500 },
      );
    }

    const cleanAliases = aliases.map((a) => a.trim()).filter(Boolean);
    if (cleanAliases.length > 0) {
      const { error: insertError } = await supabase
        .from("product_aliases")
        .insert(
          cleanAliases.map((alias) => ({
            product_id: id,
            alias,
            source: "admin_input",
          })),
        );
      if (insertError) {
        logger.error(
          "Aliases lama sudah terhapus tapi gagal insert aliases baru — produk ini sekarang TIDAK punya alias",
          {
            route: "admin/products/[id]",
            business_id: staffRow.business_id,
            product_id: id,
            error: insertError,
          },
        );
        return NextResponse.json(
          { error: "Gagal menyimpan aliases baru" },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ product });
}

// Soft-delete: is_active = false, BUKAN DELETE fisik — supaya histori stock_transactions
// yang mereferensikan produk ini tetap utuh (§13 poin 1 desain database).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id)
    .eq("business_id", staffRow.business_id);
  if (error) {
    logger.error("Gagal soft-delete produk", {
      route: "admin/products/[id]",
      business_id: staffRow.business_id,
      product_id: id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
