import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { reconfirmPin } from "@/src/lib/auth/confirm-pin";
import { pinFailureBody } from "@/src/lib/auth/lockout-messages";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireStaff = (permission: Permission = "pos.manage") => requireStaffRow(permission);

const voidSchema = z.object({
  pin: z.string().min(6),
  reason: z.string().trim().min(1, "Alasan void wajib diisi").max(300),
});

/**
 * Void nota: membalikkan stok & menandai nota 'voided'. Dua lapis proteksi
 * disengaja ditumpuk (bukan salah satu saja):
 * 1. Role — hanya admin/owner (pola sama seperti POST /api/admin/staff, §12).
 *    Kasir yang salah input TIDAK bisa membatalkan notanya sendiri; harus
 *    minta manajer, supaya void tidak jadi jalan pintas menutupi selisih kas.
 * 2. PIN re-konfirmasi (reconfirmPin, §8) — sama seperti updateStock/transferStock,
 *    karena ini aksi yang mengubah uang & stok mundur, bukan sekadar toggle UI.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;
  const { id } = await params;

  if (staffRow.role !== "owner" && staffRow.role !== "admin") {
    return NextResponse.json(
      { error: "Hanya admin/owner yang bisa membatalkan nota" },
      { status: 403 },
    );
  }

  const parsed = voidSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // RPC void_sale hanya menerima sale_id dan berjalan dengan service_role, jadi
  // kepemilikan nota wajib dicek di sini. Tanpa ini owner toko lain bisa
  // membatalkan nota tenant mana pun asal tahu ID-nya.
  const { data: sale } = await supabase
    .from("sales")
    .select("id")
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();
  if (!sale) {
    return NextResponse.json({ error: "Nota tidak ditemukan" }, { status: 404 });
  }

  // PIN diverifikasi terhadap akun staf di tenant tempat ia terdaftar (bagi
  // super admin bisa berbeda dari tenant aktif).
  const pinResult = await reconfirmPin(
    ctx.ctx.ownBusiness.slug,
    staffRow.username,
    parsed.data.pin,
  );
  if (!pinResult.ok) {
    return NextResponse.json(
      pinFailureBody(pinResult),
      { status: pinResult.status },
    );
  }

  const admin = createAdminClient();
  const { data: result, error: rpcError } = await admin.rpc("void_sale", {
    p_sale_id: id,
    p_staff_id: staffRow.id,
    p_staff_role: staffRow.role,
    p_reason: parsed.data.reason,
  });

  if (rpcError) {
    logger.error("RPC void_sale gagal", {
      route: "admin/pos/sales/[id]/void",
      business_id: staffRow.business_id,
      staff_id: staffRow.id,
      sale_id: id,
      error: rpcError,
    });
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!result?.ok) {
    const message =
      result?.error === "not_found"
        ? "Nota tidak ditemukan"
        : result?.error === "already_voided"
          ? "Nota ini sudah dibatalkan sebelumnya"
          : result?.error === "void_window_expired"
            ? "Nota ini sudah lebih dari 24 jam — hanya owner yang bisa membatalkannya lagi"
            : (result?.error ?? "Gagal membatalkan nota");
    const status = result?.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
