"use client";

import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { ROUTER_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/router";
import { QUERY_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/query-agent";
import { TRANSACTION_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/transaction-agent";
import { SINGLE_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/single-agent";
import { AGENT_TOOL_DEFINITIONS } from "@/src/lib/agents/tool-schemas";
import {
  MALFORMED_TOOL_CALL_FEEDBACK,
  TOOL_STOP_SEQUENCES,
  buildToolInstructions,
  formatToolResponse,
  parseModelReply,
  visibleStreamText,
} from "@/src/lib/agents/tool-protocol";
import { searchCachedStock } from "@/src/lib/cache/indexeddb";
import { getActiveModelId } from "@/src/lib/agents/webllm-engine";
import type { AgentExecutionMetricPayload } from "@/src/lib/agents/metrics-schema";

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface PendingConfirmation {
  audit_log_id: string;
  tool_name: "updateStock" | "transferStock";
  message: string;
}

export interface AgentTurnResult {
  agentType: "query" | "transaction" | "off_topic";
  assistantText: string;
  pendingConfirmation?: PendingConfirmation;
  toolTrace: { name: string; args: unknown; result: unknown }[];
  latencyMs?: number;
  /** Keluaran mentah model per iterasi, untuk analisis evaluasi. */
  modelReplies?: string[];
  usage?: { promptTokens: number; completionTokens: number } | null;
}

/**
 * multi_agent = Router lalu agent spesialis (arsitektur utama).
 * single_agent = baseline evaluasi: satu prompt gabungan, tanpa Router.
 */
export type AgentMode = "multi_agent" | "single_agent";

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
  return toolTrace.length > 0 ? "query" : "off_topic";
}

const MAX_TOOL_ITERATIONS = 4;

const AGENT_TOOLS_BY_TYPE: Record<"query" | "transaction" | "off_topic", string[]> = {
  query: ["getStock", "getSalesTrend"],
  transaction: ["getStock", "updateStock", "transferStock"],
  off_topic: [],
};

/**
 * Bentuk minimal chunk streaming yang benar-benar kita pakai (format delta ala
 * OpenAI). Didefinisikan lokal alih-alih mengimpor tipe persis dari web-llm —
 * `Parameters`/`ReturnType` pada fungsi ber-overload di TypeScript cuma menangkap
 * overload TERAKHIR, jadi hasil `create({ stream: true })` tidak otomatis ke-narrow
 * ke AsyncIterable lewat literal type `stream: true` setelah di-cast. Cast manual
 * ke tipe lokal ini lebih eksplisit dan tidak bergantung pada detail overload itu.
 */
interface StreamChunkDelta {
  content?: string;
}
interface StreamChunkUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}
interface StreamChunk {
  choices: { delta?: StreamChunkDelta }[];
  // Chunk terakhir dari stream OpenAI-compatible (yang ditiru WebLLM) bisa punya
  // `choices: []` + `usage` terisi kalau diminta lewat `stream_options:
  // { include_usage: true }` di create(). Tidak semua versi runtime WebLLM
  // menjaminnya, makanya semua pemakaian field ini di bawah dibuat opsional
  // dengan fallback null — jangan sampai fitur metrics ini bikin chat gagal
  // total kalau usage ternyata tidak dikirim.
  usage?: StreamChunkUsage;
}

/**
 * Konsumsi stream chunk demi chunk. Pemanggilan tool ditulis model sebagai teks
 * (lihat tool-protocol.ts), jadi yang dikirim ke UI lewat onToken hanya bagian
 * yang aman ditampilkan; blok tool call disaring.
 */
async function streamChatCompletion(
  engine: MLCEngineInterface,
  messages: ChatMessage[],
  onToken?: (partialText: string) => void,
): Promise<{
  content: string;
  usage: StreamChunkUsage | null;
}> {
  // WebLLM mengharapkan union tipe pesan yang didiskriminasi ketat per role (mis.
  // pesan 'tool' wajib punya tool_call_id, dst) — ChatMessage kita sengaja lebih
  // longgar (satu shape untuk semua role) supaya gampang dipakai di seluruh modul
  // chat. Cast ke tipe parameter asli `create()` di sini, satu tempat saja, alih-alih
  // melonggarkan ChatMessage global atau menaruh @ts-expect-error yang rawan salah
  // baris tiap kali fungsi ini diedit.
  type CreateParams = Parameters<typeof engine.chat.completions.create>[0];
  const stream = (await engine.chat.completions.create({
    messages,
    temperature: 0.2,
    stop: TOOL_STOP_SEQUENCES,
    stream: true,
    stream_options: { include_usage: true },
  } as unknown as CreateParams)) as AsyncIterable<StreamChunk>;

  let content = "";
  let usage: StreamChunkUsage | null = null;

  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage;

    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      content += delta.content;
      onToken?.(visibleStreamText(content));
    }
  }

  return { content, usage };
}

/**
 * Kirim satu baris metrics ke /api/agent/metrics — fire-and-forget murni.
 * `keepalive: true` supaya request tetap sempat terkirim walau dipanggil pas
 * runAgentTurn sudah resolve dan komponen pemanggil re-render/unmount duluan.
 * Sengaja tidak pernah throw ke pemanggil: kegagalan endpoint metrics adalah
 * masalah observability, bukan alasan untuk mengganggu pengalaman chat staf.
 */
function reportAgentExecutionMetric(payload: AgentExecutionMetricPayload) {
  fetch("/api/agent/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Diamkan — lihat catatan di atas fungsi.
  });
}

/**
 * Eksekusi tool memanggil Route Handler kita sendiri (bukan langsung Supabase dari
 * browser) — supaya validasi Zod + RLS + audit log server-side selalu jadi lapisan
 * terakhir, terlepas dari apa pun yang "diputuskan" model di browser.
 *
 * businessId dibutuhkan di sini (bukan cuma di route) supaya getStock bisa
 * fallback ke cache IndexedDB (`searchCachedStock`) saat offline — read-only,
 * jadi aman disajikan dari cache yang mungkin sedikit basi. updateStock/
 * transferStock SENGAJA TIDAK dapat fallback offline: HITL butuh verifikasi PIN
 * ke server (auth.signInWithPassword), yang secara mendasar tidak bisa dilakukan
 * offline tanpa menyimpan kredensial di client — itu downgrade keamanan yang
 * tidak sepadan dengan kenyamanan "bisa transaksi offline".
 */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  conversationId: string,
  businessId: string,
): Promise<unknown> {
  switch (name) {
    case "getStock": {
      try {
        const params = new URLSearchParams({
          query: String(args.query),
          limit: String(args.limit ?? 5),
        });
        const res = await fetch(`/api/agent/tools/get-stock?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch {
        // Offline atau server tak terjangkau — fallback ke cache lokal (disinkron
        // terakhir kali online, lihat syncStockCache). Hasilnya ditandai supaya
        // Query Agent bisa memberi tahu staf datanya mungkin tidak paling baru.
        const cached = await searchCachedStock(String(args.query), businessId);
        if (cached.length === 0) {
          return {
            results: [],
            source: "offline_cache",
            status: "no_cached_match",
            cache_note:
              "Sedang offline dan part ini tidak ada di cache. Ini BUKAN berarti stok nol — sampaikan ke staf bahwa stok belum bisa dicek sampai online lagi.",
          };
        }
        const lastSyncedAt = cached.reduce(
          (oldest, c) => (c.last_synced_at < oldest ? c.last_synced_at : oldest),
          cached[0].last_synced_at,
        );
        return {
          last_synced_at: lastSyncedAt,
          results: cached.map((c) => ({
            product_id: c.product_id,
            name: c.product_name,
            stock_by_location: [
              {
                location_id: c.location_id,
                quantity: c.quantity,
                available_quantity: c.available_quantity,
              },
            ],
          })),
          source: "offline_cache",
          cache_note:
            "Data ini dari cache offline, bisa saja tidak 100% terbaru — sampaikan ini ke staf.",
        };
      }
    }
    case "updateStock":
    case "transferStock": {
      if (!navigator.onLine) {
        return {
          error:
            "Sedang offline — perubahan stok butuh koneksi internet untuk verifikasi PIN dan mencatat transaksi dengan aman. Coba lagi setelah tersambung.",
        };
      }
      const endpoint =
        name === "updateStock"
          ? "/api/agent/tools/update-stock"
          : "/api/agent/tools/transfer-stock";
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...args, conversation_id: conversationId }),
        });
        return await res.json();
      } catch {
        return {
          error: "Gagal terhubung ke server. Coba lagi setelah koneksi stabil.",
        };
      }
    }
    case "getSalesTrend": {
      const params = new URLSearchParams({
        product_id: String(args.product_id),
        months: String(args.months ?? 6),
      });
      const res = await fetch(`/api/agent/tools/get-sales-trend?${params}`);
      return res.json();
    }
    default:
      return { error: `Tool tidak dikenal: ${name}` };
  }
}

interface NonStreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

async function routeMessage(
  engine: MLCEngineInterface,
  userMessage: string,
): Promise<{
  agentType: "query" | "transaction" | "off_topic";
  usage: NonStreamUsage | null;
}> {
  const completion = await engine.chat.completions.create({
    messages: [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
  });
  const text = completion.choices[0]?.message?.content ?? "";
  const usage = (completion as unknown as { usage?: NonStreamUsage }).usage ?? null;
  if (text.includes("TRANSACTION_AGENT")) return { agentType: "transaction", usage };
  if (text.includes("QUERY_AGENT")) return { agentType: "query", usage };
  return { agentType: "off_topic", usage };
}

/**
 * Jalankan tool-calling loop + routing tanpa instrumentasi metrics — dipisah dari
 * runAgentTurn (pembungkusnya) supaya logika timing/reporting di bawah tidak
 * bercampur dengan logika percakapan itu sendiri. Token usage diakumulasi lewat
 * parameter `usageAcc` (side effect terkontrol, satu-satunya alasan dipisah jadi
 * fungsi sendiri alih-alih inline).
 */
async function runAgentTurnInner(
  engine: MLCEngineInterface,
  history: ChatMessage[],
  userMessage: string,
  conversationId: string,
  businessId: string,
  usageAcc: { promptTokens: number; completionTokens: number; hasUsage: boolean },
  mode: AgentMode,
  modelReplies: string[],
  onToken?: (partialText: string) => void,
): Promise<AgentTurnResult> {
  const toolTrace: AgentTurnResult["toolTrace"] = [];
  // Mode single_agent: nilai ini placeholder, diganti inferAgentTypeFromTrace di runAgentTurn.
  let agentType: AgentTurnResult["agentType"] = "query";
  let systemPrompt = SINGLE_AGENT_SYSTEM_PROMPT;

  if (mode === "multi_agent") {
    const routed = await routeMessage(engine, userMessage);
    agentType = routed.agentType;
    if (routed.usage) {
      usageAcc.hasUsage = true;
      usageAcc.promptTokens += routed.usage.prompt_tokens ?? 0;
      usageAcc.completionTokens += routed.usage.completion_tokens ?? 0;
    }

    if (agentType === "off_topic") {
      return {
        agentType,
        assistantText:
          "Maaf, saya hanya bisa membantu urusan stok & suku cadang toko ini.",
        toolTrace,
      };
    }

    systemPrompt =
      agentType === "query"
        ? QUERY_AGENT_SYSTEM_PROMPT
        : TRANSACTION_AGENT_SYSTEM_PROMPT;
  }
  // Agent spesialis hanya menerima tool miliknya (rancangan-evaluasi.tex), baseline
  // menerima semua. Daftar ini juga ditegakkan saat eksekusi di bawah.
  const allowedTools = new Set(
    mode === "single_agent"
      ? AGENT_TOOL_DEFINITIONS.map((t) => t.function.name)
      : AGENT_TOOLS_BY_TYPE[agentType],
  );
  const tools = AGENT_TOOL_DEFINITIONS.filter((t) => allowedTools.has(t.function.name));
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${buildToolInstructions(tools)}`,
    },
    ...history,
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const { content, usage } = await streamChatCompletion(engine, messages, onToken);
    if (usage) {
      usageAcc.hasUsage = true;
      usageAcc.promptTokens += usage.prompt_tokens ?? 0;
      usageAcc.completionTokens += usage.completion_tokens ?? 0;
    }

    modelReplies.push(content);
    const reply = parseModelReply(content);
    // Model kecil kadang menulis JSON tool call yang rusak; beri satu kesempatan
    // memperbaiki selama masih ada sisa iterasi, alih-alih langsung menyerah.
    if (reply.calls.length === 0 && reply.malformed && i < MAX_TOOL_ITERATIONS - 1) {
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: MALFORMED_TOOL_CALL_FEEDBACK });
      continue;
    }
    if (reply.calls.length === 0) {
      return {
        agentType,
        assistantText:
          reply.text ||
          (reply.malformed ? "Maaf, saya kurang mengerti maksudnya. Bisa diulang?" : content),
        toolTrace,
      };
    }

    messages.push({ role: "assistant", content });
    const responses: string[] = [];

    for (const call of reply.calls) {
      const args = call.arguments;
      const result = allowedTools.has(call.name)
        ? await executeTool(call.name, args, conversationId, businessId)
        : { error: `Tool ${call.name} tidak tersedia untuk agent ini.` };
      toolTrace.push({ name: call.name, args, result });

      // updateStock/transferStock TIDAK melanjutkan loop — harus berhenti untuk
      // menunggu staf memasukkan PIN. Loop lanjut lagi setelah confirm terpisah.
      if (
        (call.name === "updateStock" || call.name === "transferStock") &&
        result &&
        typeof result === "object" &&
        "audit_log_id" in result
      ) {
        const r = result as { audit_log_id: string; message: string };
        return {
          agentType,
          assistantText: r.message,
          pendingConfirmation: {
            audit_log_id: r.audit_log_id,
            tool_name: call.name,
            message: r.message,
          },
          toolTrace,
        };
      }

      responses.push(formatToolResponse(call.name, result));
    }

    // Dikirim sebagai pesan user, bukan role 'tool': template chat model non-Hermes
    // di WebLLM belum tentu mendukung role 'tool' tanpa parameter `tools`.
    messages.push({ role: "user", content: responses.join("\n") });
  }

  return {
    agentType,
    assistantText:
      "Maaf, permintaan ini terlalu kompleks untuk saya proses sekarang. Coba lebih spesifik ya.",
    toolTrace,
  };
}

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
  options: { mode?: AgentMode } = {},
): Promise<AgentTurnResult> {
  const mode = options.mode ?? "multi_agent";
  const startedAt = performance.now();
  // Perkiraan panjang konteks di awal giliran (karakter, bukan token exact dari
  // tokenizer) — proxy kasar tapi cukup untuk melihat tren "percakapan makin
  // panjang -> makin lambat" di evaluasi BAB 4, tanpa perlu tokenizer WebLLM
  // di-load terpisah cuma untuk menghitung ini.
  const contextLengthAtCall =
    history.reduce((sum, m) => sum + m.content.length, 0) + userMessage.length;
  const usageAcc = { promptTokens: 0, completionTokens: 0, hasUsage: false };
  const modelReplies: string[] = [];

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
      onToken,
    );
    const latencyMs = Math.round(performance.now() - startedAt);
    const result: AgentTurnResult = {
      ...inner,
      modelReplies,
      agentType:
        mode === "single_agent"
          ? inferAgentTypeFromTrace(inner.toolTrace)
          : inner.agentType,
      latencyMs,
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
