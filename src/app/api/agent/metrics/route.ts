import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentExecutionMetricSchema } from "@/src/lib/agents/metrics-schema";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: staffRow } = await supabase
    .from("staff")
    .select("business_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!staffRow)
    return NextResponse.json(
      { error: "Akun staf tidak ditemukan" },
      { status: 403 },
    );

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
  // observability, bukan bagian dari alur transaksi stok. Cukup log server-side
  // (lewat status non-2xx) supaya masih kelihatan di monitoring, tapi
  // orchestrator.ts memanggil endpoint ini tanpa menunggu/menangani hasilnya.
  if (error) {
    return NextResponse.json(
      { error: "Gagal menyimpan metrics" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
