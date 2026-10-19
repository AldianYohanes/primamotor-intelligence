"use client";

import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import {
  type AgentMode,
  type AgentTurnResult,
  type ChatMessage,
} from "@/src/lib/agents/turn/types";
import { reportAgentExecutionMetric } from "@/src/lib/agents/turn/metrics";
import { KNOWN_TOOL_NAMES, runAgentTurnInner } from "@/src/lib/agents/turn/agent-loop";
import { getActiveModelId } from "@/src/lib/agents/webllm-engine";
import { InferenceMeter, type InferenceSnapshot } from "@/src/lib/agents/inference-stats";
import {
  readDevicePosition,
  type GeoPoint,
} from "@/src/lib/agents/location-choice";
import { trimHistoryForContext } from "@/src/lib/agents/history-window";
import {
  ProcessRecorder,
  type ProcessStep,
} from "@/src/lib/agents/process-trace";

export type { LocationChoice } from "@/src/lib/agents/location-choice";
export type { ProcessStep } from "@/src/lib/agents/process-trace";
export { UNAVAILABLE_TOOL_REPLY, UNBACKED_STOCK_REPLY } from "@/src/lib/agents/turn/replies";
export { submitMutationChoice } from "@/src/lib/agents/turn/mutation";
export { TurnStoppedError } from "@/src/lib/agents/turn/types";
export type {
  AgentMode,
  AgentTurnResult,
  ChatMessage,
  ChatRole,
  MutationChoice,
  PendingConfirmation,
  ProductChoice,
} from "@/src/lib/agents/turn/types";

/**
 * Baseline tidak punya keluaran Router, jadi kelasnya disimpulkan dari tool
 * yang dipanggil. Konsekuensinya: permintaan transaksi yang ditolak model
 * sebelum memanggil tool mutasi (mis. stok kurang) terbaca sebagai "query".
 */
export function inferAgentTypeFromTrace(
  toolTrace: AgentTurnResult["toolTrace"],
): AgentTurnResult["agentType"] {
  if (toolTrace.some((t) => t.name === "updateStock" || t.name === "transferStock")) {
    return "transaction";
  }
  // Alat karangan model (mis. getHoursOfOperation di O-01) bukan pembacaan data stok.
  return toolTrace.some((t) => KNOWN_TOOL_NAMES.has(t.name)) ? "query" : "off_topic";
}

/** Juga menjawab "apa yang bisa kamu lakukan?", yang oleh Router diarahkan ke OFF_TOPIC. */
export { OFF_TOPIC_REPLY } from "@/src/lib/agents/off-topic";

/**
 * Jalankan satu giliran percakapan penuh: routing lalu tool-calling loop dengan
 * batas iterasi (MAX_TOOL_ITERATIONS) supaya tidak infinite loop kalau model
 * "ngotot" memanggil tool terus-menerus.
 *
 * Membungkus runAgentTurnInner dengan timing + pelaporan metrics: SATU baris
 * agent_execution_metrics per giliran chat (bukan per pemanggilan LLM individual
 * di dalam loop) — cukup granular untuk evaluasi BAB 4, tidak membanjiri tabel.
 * Pelaporan metrics fire-and-forget dan tidak pernah mengubah perilaku/hasil
 * yang dilihat staf, termasuk saat runAgentTurnInner melempar error: error tetap
 * dilaporkan ke metrics (succeeded: false) lalu di-rethrow apa adanya ke pemanggil
 * (ChatWindow.tsx) supaya penanganan error UI existing tidak berubah.
 */
export async function runAgentTurn(
  engine: MLCEngineInterface,
  history: ChatMessage[],
  userMessage: string,
  conversationId: string,
  businessId: string,
  onToken?: (partialText: string) => void,
  options: {
    mode?: AgentMode;
    /** Posisi perangkat untuk saran lokasi terdekat; /eval memakai posisi tetap. */
    getDevicePosition?: () => Promise<GeoPoint | null>;
    /** Langkah "Lihat proses" secara live; hasil akhirnya juga ada di processSteps. */
    onStep?: (steps: ProcessStep[]) => void;
    /** Batalkan untuk menghentikan giliran; runAgentTurn melempar TurnStoppedError. */
    signal?: AbortSignal;
    /** Statistik inferensi live (waktu, token, kecepatan per panggilan model). */
    onInference?: (snapshot: InferenceSnapshot) => void;
  } = {},
): Promise<AgentTurnResult> {
  const mode = options.mode ?? "multi_agent";
  const startedAt = performance.now();
  // Perkiraan panjang konteks di awal giliran (karakter, bukan token exact dari
  // tokenizer) — proxy kasar tapi cukup untuk melihat tren "percakapan makin
  // panjang -> makin lambat" di evaluasi BAB 4, tanpa perlu tokenizer WebLLM
  // di-load terpisah cuma untuk menghitung ini.
  // Dihitung dari riwayat yang benar-benar dikirim ke agent (setelah sliding window).
  const contextLengthAtCall =
    trimHistoryForContext(history).reduce((sum, m) => sum + m.content.length, 0) +
    userMessage.length;
  const meter = new InferenceMeter(getActiveModelId(), options.onInference);
  const usageAcc = { promptTokens: 0, completionTokens: 0, hasUsage: false, meter };
  const modelReplies: string[] = [];
  const rec = new ProcessRecorder(options.onStep);
  const meta: { routerAgentType?: AgentTurnResult["agentType"] } = {};

  try {
    const inner = await runAgentTurnInner(
      engine,
      history,
      userMessage,
      conversationId,
      businessId,
      usageAcc,
      mode,
      modelReplies,
      options.getDevicePosition ?? readDevicePosition,
      rec,
      meta,
      onToken,
      options.signal,
    );
    const latencyMs = Math.round(performance.now() - startedAt);
    const result: AgentTurnResult = {
      ...inner,
      modelReplies,
      agentType:
        mode === "single_agent"
          ? inferAgentTypeFromTrace(inner.toolTrace)
          : inner.agentType,
      ...(mode === "multi_agent" && meta.routerAgentType && { routerAgentType: meta.routerAgentType }),
      latencyMs,
      processSteps: rec.steps,
      inferenceStats: meter.snapshot(),
      usage: usageAcc.hasUsage
        ? {
            promptTokens: usageAcc.promptTokens,
            completionTokens: usageAcc.completionTokens,
          }
        : null,
    };
    reportAgentExecutionMetric({
      conversation_id: conversationId,
      agent_type: result.agentType,
      model_name: getActiveModelId(),
      prompt_tokens: usageAcc.hasUsage ? usageAcc.promptTokens : null,
      completion_tokens: usageAcc.hasUsage ? usageAcc.completionTokens : null,
      context_length_at_call: contextLengthAtCall,
      latency_ms: latencyMs,
      succeeded: true,
      error_message: null,
    });
    return result;
  } catch (err) {
    rec.failRunning();
    // agent_type tidak diketahui pasti kalau error terjadi sebelum/di tengah
    // routing (mis. engine belum siap) — "off_topic" dipakai sebagai nilai
    // netral di kolom yang NOT NULL, bukan klaim bahwa pesannya off-topic.
    reportAgentExecutionMetric({
      conversation_id: conversationId,
      agent_type: "off_topic",
      model_name: getActiveModelId(),
      prompt_tokens: usageAcc.hasUsage ? usageAcc.promptTokens : null,
      completion_tokens: usageAcc.hasUsage ? usageAcc.completionTokens : null,
      context_length_at_call: contextLengthAtCall,
      latency_ms: Math.round(performance.now() - startedAt),
      succeeded: false,
      error_message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
