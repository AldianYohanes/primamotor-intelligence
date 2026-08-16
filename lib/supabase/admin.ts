import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/db/types";

/**
 * Client server-only dengan SERVICE ROLE KEY — bypass RLS sepenuhnya.
 *
 * HANYA dipakai untuk:
 *  - RPC record_stock_transaction/transfer_stock setelah HITL (PIN) dikonfirmasi
 *  - Insert agent_audit_log & agent_execution_metrics
 *  - Cron Monitoring Agent (berjalan di luar konteks sesi user)
 *  - Alur login (cek staff sebelum ada sesi) & signup (buat business + auth user)
 *
 * Paket `server-only` memaksa build gagal kalau file ini ke-import dari
 * client component — lapisan pengaman tambahan supaya service role key
 * tidak pernah bocor ke bundle browser.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
