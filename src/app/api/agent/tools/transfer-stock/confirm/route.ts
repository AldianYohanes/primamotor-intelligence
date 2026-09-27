import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { transferStockConfirmSchema } from "@/src/lib/agents/tool-schemas";
import { reconfirmPin } from "@/src/lib/auth/confirm-pin";
import { logger } from "@/src/lib/logging/logger";
import { requireApi } from "@/src/lib/auth/staff-context";

export async function POST(req: NextRequest) {
  const parsed = transferStockConfirmSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { audit_log_id, pin } = parsed.data;

  // Sebelumnya route ini tanpa sesi: PIN diverifikasi untuk (business_slug,
  // username) dari body, sedangkan staff_id & audit_log_id juga dari body dan
  // tidak dikaitkan. Siapa pun yang tahu PIN-nya sendiri di tenant mana pun bisa
  // mengonfirmasi transaksi pending tenant lain dan mengatasnamakan staf lain.
  // Sekarang identitas diambil dari sesi, PIN dicek untuk akun itu sendiri, dan
  // audit log wajib milik tenant aktif.
  const auth = await requireApi("chat.use");
  if (auth instanceof NextResponse) return auth;
  const staff_id = auth.staff.id;
  const business_slug = auth.ownBusiness.slug;

  const pinResult = await reconfirmPin(business_slug, auth.staff.username, pin);
  if (!pinResult.ok)
    return NextResponse.json(
      { error: pinResult.error },
      { status: pinResult.status },
    );

  const admin = createAdminClient();

  const { data: auditLog } = await admin
    .from("agent_audit_log")
    .select("id")
    .eq("id", audit_log_id)
    .eq("business_id", auth.tenant.id)
    .maybeSingle();
  if (!auditLog) {
    return NextResponse.json(
      { error: "Transaksi tidak ditemukan di toko ini" },
      { status: 404 },
    );
  }

  // Sama seperti update-stock/confirm: transfer_stock + release_reservation +
  // update status sekarang satu RPC atomik (confirm_transfer_stock,
  // 0024_confirm_stock_atomic.sql).
  const { data: result, error: rpcError } = await admin.rpc(
    "confirm_transfer_stock",
    {
      p_audit_log_id: audit_log_id,
      p_staff_id: staff_id,
    },
  );

  if (rpcError) {
    logger.error("RPC confirm_transfer_stock gagal", {
      route: "agent/tools/transfer-stock/confirm",
      business_slug,
      staff_id,
      audit_log_id,
      error: rpcError,
    });
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!result?.ok) {
    logger.warn("confirm_transfer_stock ditolak (bukan error server)", {
      route: "agent/tools/transfer-stock/confirm",
      business_slug,
      staff_id,
      audit_log_id,
      reject_reason: result?.error,
      previous_status: result?.status,
    });
    const status =
      result?.error === "not_found"
        ? 404
        : result?.error === "not_pending"
          ? 409
          : 422;
    const message =
      result?.error === "not_found"
        ? "Audit log tidak ditemukan"
        : result?.error === "not_pending"
          ? `Transaksi ini sudah berstatus '${result.status}', tidak bisa dikonfirmasi ulang`
          : (result?.error ?? "Gagal mengonfirmasi transfer");
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
