import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/src/lib/logging/logger";

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, business_id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!staffRow)
    return {
      error: NextResponse.json(
        { error: "Akun staf tidak ditemukan" },
        { status: 403 },
      ),
    } as const;
  return { supabase, staffRow } as const;
}

const claimSchema = z.object({
  reason: z.string().trim().min(1, "Alasan klaim wajib diisi").max(300),
  resolution: z.enum(["replaced", "refunded", "repaired"]),
});

/**
 * Klaim garansi per-item — beda dari void nota (sales/[id]/void). Sengaja
 * TIDAK dibatasi admin/owner dan TIDAK butuh PIN — ini bukan aksi finansial
 * yang membalikkan pembayaran, cuma mencatat penukaran/perbaikan barang &
 * (untuk resolusi 'replaced'/'refunded') mengembalikan stok. Kasir harian
 * yang melayani pelanggan balik karena barang cacat harus bisa proses ini
 * langsung tanpa nunggu manajer.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;
  const { id: saleId, itemId } = await params;

  const parsed = claimSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Defense in depth — pastikan item ini memang milik nota & tenant yang benar
  // sebelum panggil RPC, supaya error 404 jelas alih-alih pesan RPC generik.
  const { data: item } = await supabase
    .from("sale_items")
    .select("id, sale_id")
    .eq("id", itemId)
    .eq("sale_id", saleId)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: "Item nota tidak ditemukan" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: result, error: rpcError } = await admin.rpc("claim_warranty_return", {
    p_business_id: staffRow.business_id,
    p_sale_item_id: itemId,
    p_staff_id: staffRow.id,
    p_reason: parsed.data.reason,
    p_resolution: parsed.data.resolution,
  });

  if (rpcError) {
    logger.error("RPC claim_warranty_return gagal", {
      route: "admin/pos/sales/[id]/items/[itemId]/warranty-claim",
      business_id: staffRow.business_id,
      staff_id: staffRow.id,
      sale_id: saleId,
      sale_item_id: itemId,
      error: rpcError,
    });
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!result?.ok) {
    const message =
      result?.error === "item_not_found"
        ? "Item nota tidak ditemukan"
        : result?.error === "already_claimed"
          ? "Item ini sudah pernah diklaim garansinya"
          : result?.error === "sale_voided"
            ? "Nota ini sudah dibatalkan — klaim garansi tidak berlaku"
            : result?.error === "no_warranty"
              ? "Produk ini tidak memiliki garansi yang dilacak"
              : result?.error === "warranty_expired"
                ? "Masa garansi produk ini sudah habis"
                : (result?.error ?? "Gagal memproses klaim garansi");
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
