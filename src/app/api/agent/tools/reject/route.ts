import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  UpdateStockInput,
  TransferStockInput,
} from "@/src/lib/agents/tool-schemas";
import { logger } from "@/src/lib/logging/logger";

const rejectSchema = z.object({ audit_log_id: z.string().uuid() });

/**
 * Dipanggil saat staf menekan "Batal" di PinConfirmDialog (components/chat/PinConfirmDialog.tsx)
 * — atau kapan pun proposal 'pending' perlu dibatalkan tanpa PIN. TANPA endpoint ini:
 *  1. Baris agent_audit_log tetap 'pending' selamanya (tidak pernah 'rejected')
 *  2. SEJAK reserve_stock diaktifkan (0023_stock_reservations.sql, update-stock &
 *     transfer-stock route), reservasinya JUGA tidak pernah dilepas — stok yang
 *     "dipegang" jadi hilang permanen dari available_quantity, bukan cuma cosmetic.
 * (Ada juga expire_stale_pending_reservations sebagai jaring pengaman kalau staf
 * menutup tab tanpa klik apa pun sama sekali — tapi itu nunggu 15 menit, endpoint
 * ini melepas SEKETIKA saat staf memang sengaja membatalkan.)
 *
 * Aman dipanggil dobel (idempoten): kalau status sudah bukan 'pending' lagi
 * (race dengan confirm yang keburu jalan, atau sudah pernah di-reject), cuma
 * balas ok tanpa efek samping — bukan error.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, business_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!staffRow)
    return NextResponse.json(
      { error: "Akun staf tidak ditemukan" },
      { status: 403 },
    );

  const parsed = rejectSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });

  const admin = createAdminClient();
  const { data: log } = await admin
    .from("agent_audit_log")
    .select("*")
    .eq("id", parsed.data.audit_log_id)
    .eq("business_id", staffRow.business_id) // defense in depth — staf tidak bisa reject punya tenant lain
    .maybeSingle();

  if (!log)
    return NextResponse.json(
      { error: "Transaksi tidak ditemukan" },
      { status: 404 },
    );
  if (log.status !== "pending") {
    return NextResponse.json({ ok: true, alreadyResolved: true });
  }

  try {
    if (log.tool_name === "updateStock") {
      const p = log.input_params as UpdateStockInput;
      if (p.direction === "keluar") {
        await admin.rpc("release_reservation", {
          p_product_id: p.product_id,
          p_location_id: p.location_id,
          p_quantity: p.quantity,
        });
      }
    } else if (log.tool_name === "transferStock") {
      const p = log.input_params as TransferStockInput;
      await admin.rpc("release_reservation", {
        p_product_id: p.product_id,
        p_location_id: p.from_location_id,
        p_quantity: p.quantity,
      });
    }
  } catch (err) {
    // Reservasi gagal dilepas (mis. input_params korup) — tetap lanjut tandai
    // 'rejected' di bawah. Row 'pending' nyangkut selamanya lebih buruk daripada
    // reservasi nyangkut sampai expire_stale_pending_reservations membersihkannya nanti.
    logger.error("Gagal melepas reservasi stok saat reject", {
      route: "agent/tools/reject",
      business_id: staffRow.business_id,
      staff_id: staffRow.id,
      audit_log_id: parsed.data.audit_log_id,
      tool_name: log.tool_name,
      error: err,
    });
  }

  await admin
    .from("agent_audit_log")
    .update({ status: "rejected" })
    .eq("id", parsed.data.audit_log_id);

  return NextResponse.json({ ok: true });
}
