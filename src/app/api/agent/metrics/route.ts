import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { agentExecutionMetricSchema } from "@/src/lib/agents/metrics-schema";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";

/**
 * Menyimpan satu baris metrik performa per giliran chat (runAgentTurn) —
 * latency & token usage LLM on-device, jadi bahan evaluasi BAB 4 (performa
 * WebLLM di WiFi toko biasa).
 *
 * Dipanggil fire-and-forget dari orchestrator.ts (client, "use client") lewat
 * fetch(..., { keepalive: true }) — kalau endpoint ini gagal atau lambat,
 * TIDAK BOLEH mengganggu alur chat staf. Makanya route ini juga sengaja
 * "murah": tidak ada validasi silang product/location seperti update-stock,
 * cuma pastikan staf yang login memang berhak menulis metrik untuk
 * business_id miliknya sendiri.
 *
 * Auth dulu lewat createClient() (sesi staf, RLS-respecting) baru insert
 * lewat createAdminClient() — identitas sudah diverifikasi di server sebelum
 * eskalasi ke admin write, sama seperti insert agent_audit_log di
 * update-stock/route.ts & transfer-stock/route.ts. business_id SELALU dari
 * staffRow, tidak pernah dari body — mencegah staf toko A menulis metrik
 * seolah-olah dari toko B.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaffRow("chat.use");
  if ("error" in auth) return auth.error;
  const { staffRow } = auth;

  const parsed = agentExecutionMetricSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload metrics tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from("agent_execution_metrics").insert({
    business_id: staffRow.business_id,
    conversation_id: body.conversation_id,
    agent_type: body.agent_type,
    model_name: body.model_name,
    prompt_tokens: body.prompt_tokens,
    completion_tokens: body.completion_tokens,
    context_length_at_call: body.context_length_at_call,
    latency_ms: body.latency_ms,
    succeeded: body.succeeded,
    error_message: body.error_message,
  });

  // Gagal simpan metrics TIDAK BOLEH jadi error keras ke client — ini
  // observability, bukan bagian dari alur transaksi stok. Tetap di-log
  // terstruktur (server-side) supaya kegagalan insert tidak sepenuhnya hilang,
  // tapi orchestrator.ts memanggil endpoint ini tanpa menunggu/menangani hasilnya.
  if (error) {
    logger.error("Gagal menyimpan agent_execution_metrics", {
      route: "agent/metrics",
      business_id: staffRow.business_id,
      conversation_id: body.conversation_id,
      agent_type: body.agent_type,
      error,
    });
    return NextResponse.json(
      { error: "Gagal menyimpan metrics" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
