import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transferStockConfirmSchema } from "@/src/lib/agents/tool-schemas";
import { reconfirmPin } from "@/src/lib/auth/confirm-pin";

export async function POST(req: NextRequest) {
  const parsed = transferStockConfirmSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { audit_log_id, staff_id, business_slug, username, pin } = parsed.data;

  const pinResult = await reconfirmPin(business_slug, username, pin);
  if (!pinResult.ok)
    return NextResponse.json(
      { error: pinResult.error },
      { status: pinResult.status },
    );

  const admin = createAdminClient();

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
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!result?.ok) {
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
