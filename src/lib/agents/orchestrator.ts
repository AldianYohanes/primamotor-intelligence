"use client";

import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { ROUTER_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/router";
import { QUERY_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/query-agent";
import { TRANSACTION_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/transaction-agent";
import { AGENT_TOOL_DEFINITIONS } from "@/src/lib/agents/tool-schemas";
import { searchCachedStock } from "@/src/lib/cache/indexeddb";

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
}

const MAX_TOOL_ITERATIONS = 4;

interface AccumulatedToolCall {
  id: string;
  function: { name: string; arguments: string };
}

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
  tool_calls?: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
}
interface StreamChunk {
  choices: { delta?: StreamChunkDelta }[];
}

/**
 * Konsumsi stream chunk demi chunk (format delta ala OpenAI yang juga dipakai
 * WebLLM). Dua hal diakumulasi paralel: teks jawaban (dikirim ke UI real-time
 * lewat onToken) dan tool_calls (baru utuh setelah stream selesai, karena
 * name/arguments datang terpecah antar chunk berdasarkan index).
 *
 * Kalau runtime WebLLM yang dipakai ternyata tidak mendukung streaming
 * tool_calls dengan baik, fungsi ini tetap aman: tool_calls yang terbentuk
 * parsial/tidak valid JSON akan gagal di JSON.parse pemanggil dan loop akan
 * fallback memperlakukannya sebagai jawaban teks biasa.
 */
async function streamChatCompletion(
  engine: MLCEngineInterface,
  messages: ChatMessage[],
  tools: typeof AGENT_TOOL_DEFINITIONS,
  onToken?: (partialText: string) => void,
): Promise<{ content: string; toolCalls: AccumulatedToolCall[] }> {
  // WebLLM mengharapkan union tipe pesan yang didiskriminasi ketat per role (mis.
  // pesan 'tool' wajib punya tool_call_id, dst) — ChatMessage kita sengaja lebih
  // longgar (satu shape untuk semua role) supaya gampang dipakai di seluruh modul
  // chat. Cast ke tipe parameter asli `create()` di sini, satu tempat saja, alih-alih
  // melonggarkan ChatMessage global atau menaruh @ts-expect-error yang rawan salah
  // baris tiap kali fungsi ini diedit.
  type CreateParams = Parameters<typeof engine.chat.completions.create>[0];
  const stream = (await engine.chat.completions.create({
    messages,
    tools,
    temperature: 0.2,
    stream: true,
  } as unknown as CreateParams)) as AsyncIterable<StreamChunk>;

  let content = "";
  const toolCallsByIndex = new Map<number, AccumulatedToolCall>();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      content += delta.content;
      onToken?.(content);
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        const existing = toolCallsByIndex.get(idx) ?? {
          id: tc.id ?? `call_${idx}`,
          function: { name: "", arguments: "" },
        };
        if (tc.function?.name) existing.function.name += tc.function.name;
        if (tc.function?.arguments)
          existing.function.arguments += tc.function.arguments;
        if (tc.id) existing.id = tc.id;
        toolCallsByIndex.set(idx, existing);
      }
    }
  }

  return { content, toolCalls: Array.from(toolCallsByIndex.values()) };
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
        return {
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

async function routeMessage(
  engine: MLCEngineInterface,
  userMessage: string,
): Promise<"query" | "transaction" | "off_topic"> {
  const completion = await engine.chat.completions.create({
    messages: [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
  });
  const text = completion.choices[0]?.message?.content ?? "";
  if (text.includes("TRANSACTION_AGENT")) return "transaction";
  if (text.includes("QUERY_AGENT")) return "query";
  return "off_topic";
}

/**
 * Jalankan satu giliran percakapan penuh: routing lalu tool-calling loop dengan
 * batas iterasi (MAX_TOOL_ITERATIONS) supaya tidak infinite loop kalau model
 * "ngotot" memanggil tool terus-menerus.
 */
export async function runAgentTurn(
  engine: MLCEngineInterface,
  history: ChatMessage[],
  userMessage: string,
  conversationId: string,
  businessId: string,
  onToken?: (partialText: string) => void,
): Promise<AgentTurnResult> {
  const agentType = await routeMessage(engine, userMessage);
  const toolTrace: AgentTurnResult["toolTrace"] = [];

  if (agentType === "off_topic") {
    return {
      agentType,
      assistantText:
        "Maaf, saya hanya bisa membantu urusan stok & suku cadang toko ini.",
      toolTrace,
    };
  }

  const systemPrompt =
    agentType === "query"
      ? QUERY_AGENT_SYSTEM_PROMPT
      : TRANSACTION_AGENT_SYSTEM_PROMPT;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    // Setiap iterasi (termasuk setelah tool result masuk ke messages) di-stream ke
    // UI lewat onToken — kalau iterasi ini ujung-ujungnya cuma tool_calls tanpa teks,
    // draft yang sempat tampil di UI otomatis kosong lagi, itu wajar (model memang
    // tidak menulis apa-apa sebelum memanggil tool).
    const { content, toolCalls } = await streamChatCompletion(
      engine,
      messages,
      AGENT_TOOL_DEFINITIONS,
      onToken,
    );

    if (toolCalls.length === 0) {
      return { agentType, assistantText: content, toolTrace };
    }

    messages.push({ role: "assistant", content });

    for (const call of toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // Streaming tool_calls yang gagal di-parse diperlakukan sebagai jawaban teks biasa
        // (lihat catatan di streamChatCompletion) — jangan crash, mundur ke isi content.
        return {
          agentType,
          assistantText:
            content || "Maaf, saya kurang mengerti maksudnya. Bisa diulang?",
          toolTrace,
        };
      }

      const result = await executeTool(
        call.function.name,
        args,
        conversationId,
        businessId,
      );
      toolTrace.push({ name: call.function.name, args, result });

      // updateStock/transferStock TIDAK melanjutkan loop — harus berhenti untuk
      // menunggu staf memasukkan PIN. Loop lanjut lagi setelah confirm terpisah.
      if (
        (call.function.name === "updateStock" ||
          call.function.name === "transferStock") &&
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
            tool_name: call.function.name,
            message: r.message,
          },
          toolTrace,
        };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    agentType,
    assistantText:
      "Maaf, permintaan ini terlalu kompleks untuk saya proses sekarang. Coba lebih spesifik ya.",
    toolTrace,
  };
}
