import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconfirmPin } from "@/src/lib/auth/confirm-pin";
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
    .select("id, business_id, role, username, businesses(slug)")
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
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { staffRow } = ctx;
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

  // @ts-expect-error -- bentuk join Supabase, businesses adalah objek tunggal (many-to-one)
  const businessSlug: string = staffRow.businesses.slug;
  const pinResult = await reconfirmPin(businessSlug, staffRow.username, parsed.data.pin);
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error }, { status: pinResult.status });
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
