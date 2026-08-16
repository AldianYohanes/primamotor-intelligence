import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateStockConfirmSchema } from "@/src/lib/agents/tool-schemas";
import { reconfirmPin } from "@/src/lib/auth/confirm-pin";
import { logger } from "@/src/lib/logging/logger";

export async function POST(req: NextRequest) {
  const parsed = updateStockConfirmSchema.safeParse(await req.json());
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

  // Seluruh eksekusi (record_stock_transaction + release_reservation + update
  // status agent_audit_log) sekarang dibungkus SATU RPC atomik
  // (confirm_update_stock, lihat 0024_confirm_stock_atomic.sql) — sebelumnya
  // ini tiga panggilan network terpisah dari sini, celah kalau proses crash
  // di tengah jalan. Route Handler ini murni jadi lapisan auth (PIN) + terjemahan
  // hasil RPC ke HTTP status, bukan lagi tempat orkestrasi multi-langkah.
  const { data: result, error: rpcError } = await admin.rpc(
    "confirm_update_stock",
    {
      p_audit_log_id: audit_log_id,
      p_staff_id: staff_id,
    },
  );

  if (rpcError) {
    // Ini eksekusi transaksi stok yang sudah lolos verifikasi PIN — gagal di
    // titik ini (RPC atomik confirm_update_stock) berarti staf sudah yakin
    // mau transaksi tapi gagal tersimpan. Wajib ke-log detail buat investigasi,
    // bukan cuma tampil sebagai pesan error generik ke staf.
    logger.error("RPC confirm_update_stock gagal", {
      route: "agent/tools/update-stock/confirm",
      business_slug,
      staff_id,
      audit_log_id,
      error: rpcError,
    });
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!result?.ok) {
    logger.warn("confirm_update_stock ditolak (bukan error server)", {
      route: "agent/tools/update-stock/confirm",
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
          : (result?.error ?? "Gagal mengonfirmasi transaksi");
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ transaction_id: result.transaction_id });
}
