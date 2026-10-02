"use client";

import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { ROUTER_SYSTEM_PROMPT, buildRouterInput, parseRouterReply } from "@/src/lib/agents/prompts/router";
import { QUERY_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/query-agent";
import { TRANSACTION_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/transaction-agent";
import { SINGLE_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/single-agent";
import { AGENT_TOOL_DEFINITIONS } from "@/src/lib/agents/tool-schemas";
import {
  MALFORMED_TOOL_CALL_FEEDBACK,
  MISSING_TOOL_CALL_FEEDBACK,
  TOOL_STOP_SEQUENCES,
  announcesToolCall,
  buildToolInstructions,
  formatToolResponse,
  parseModelReply,
  visibleStreamText,
  withClosedToolCall,
} from "@/src/lib/agents/tool-protocol";
import { searchCachedStock } from "@/src/lib/cache/indexeddb";
import { getActiveModelId } from "@/src/lib/agents/webllm-engine";
import type { AgentExecutionMetricPayload } from "@/src/lib/agents/metrics-schema";
import {
  buildLocationChoice,
  locationChoiceMessage,
  readDevicePosition,
  resolveLocationRef,
  resolveTransferLocations,
  resolveUpdateLocation,
  type GeoPoint,
  type LocationChoice,
  type TenantLocation,
} from "@/src/lib/agents/location-choice";
import { describeStock, pickProduct, type ProductSearchResult } from "@/src/lib/agents/product-resolution";
import { trimHistoryForContext } from "@/src/lib/agents/history-window";
import {
  ProcessRecorder,
  answerStep,
  mutationOutcomeStep,
  retryStep,
  routeStep,
  toolResultStep,
  toolStartStep,
  type ProcessStep,
} from "@/src/lib/agents/process-trace";

export type { LocationChoice } from "@/src/lib/agents/location-choice";
export type { ProcessStep } from "@/src/lib/agents/process-trace";

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
  /** Transaksi ditahan sampai staf memilih produk atau lokasi. */
  choice?: MutationChoice;
  /**
   * args = keluaran asli model; resolvedArgs = tulisan model dipetakan ke UUID
   * (dasar ParameterAccuracy); executedArgs = yang benar-benar dikirim ke server.
   */
  toolTrace: { name: string; args: unknown; result: unknown; resolvedArgs?: unknown; executedArgs?: unknown }[];
  latencyMs?: number;
  /** Keluaran mentah model per iterasi, untuk analisis evaluasi. */
  modelReplies?: string[];
  usage?: { promptTokens: number; completionTokens: number } | null;
  /** Langkah "Lihat proses" (process-trace.ts), ditampilkan ke staf. */
  processSteps?: ProcessStep[];
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
              "Server tidak bisa dihubungi (offline atau gangguan) dan part ini tidak ada di cache. Ini BUKAN berarti stok nol — sampaikan ke staf bahwa stok belum bisa dicek, coba lagi sebentar lagi.",
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
            "Server tidak bisa dihubungi, jadi data ini dari cache perangkat dan bisa saja tidak 100% terbaru — sampaikan ini ke staf.",
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
          // Route mewajibkan business_id dan mencocokkannya dengan sesi staf (403 bila beda).
          body: JSON.stringify({ ...args, business_id: businessId, conversation_id: conversationId }),
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

async function fetchTenantLocations(): Promise<TenantLocation[] | null> {
  try {
    const res = await fetch("/api/agent/tools/locations");
    if (!res.ok) return null;
    const body = (await res.json()) as { locations?: TenantLocation[] };
    return body.locations ?? null;
  } catch {
    return null;
  }
}

type MutationTool = "updateStock" | "transferStock";

function isMutationTool(name: string): name is MutationTool {
  return name === "updateStock" || name === "transferStock";
}

export interface ProductChoice {
  kind: "product";
  toolName: MutationTool;
  /** Argumen dari model; product_id diisi dari pilihan staf. */
  args: Record<string, unknown>;
  userMessage: string;
  options: { id: string; name: string; detail: string }[];
}

export type MutationChoice = ProductChoice | LocationChoice;

interface MutationOutcome {
  message: string;
  pendingConfirmation?: PendingConfirmation;
  choice?: MutationChoice;
  /** Ringkasan untuk toolTrace/evaluasi. */
  result: Record<string, unknown>;
  /** Nama barang & lokasi TULISAN MODEL dipetakan ke UUID, tanpa bantuan kata staf (dasar ParameterAccuracy). */
  resolvedArgs?: Record<string, unknown>;
  /** Argumen yang benar-benar dikirim ke server. */
  executedArgs?: Record<string, unknown>;
}

const OFFLINE_MUTATION_MESSAGE =
  "Sedang offline — perubahan stok butuh koneksi internet untuk verifikasi PIN dan mencatat transaksi dengan aman. Coba lagi setelah tersambung.";

async function searchProducts(query: string, conversationId: string, businessId: string) {
  const res = (await executeTool("getStock", { query, limit: 5 }, conversationId, businessId)) as {
    results?: ProductSearchResult[];
    source?: string;
  } | null;
  // getStock jatuh ke cache offline bila request ke server gagal; saat online
  // itu berarti server bermasalah, bukan barangnya tidak ada.
  return { results: res?.results ?? [], fromCache: res?.source === "offline_cache" };
}

async function executeMutation(
  toolName: MutationTool,
  executedArgs: Record<string, unknown>,
  product: ProductSearchResult | null,
  conversationId: string,
  businessId: string,
): Promise<MutationOutcome> {
  const result = (await executeTool(toolName, executedArgs, conversationId, businessId)) as {
    audit_log_id?: string;
    message?: string;
    error?: string;
  } | null;
  if (result?.audit_log_id && result.message) {
    return {
      message: result.message,
      pendingConfirmation: { audit_log_id: result.audit_log_id, tool_name: toolName, message: result.message },
      result: { status: "pending_confirmation", audit_log_id: result.audit_log_id },
      executedArgs,
    };
  }
  const error = result?.error ?? "Gagal mencatat transaksi. Coba lagi ya.";
  const stockNote = product && /tidak mencukupi/i.test(error) ? ` Stok tersedia ${product.name}: ${describeStock(product)}.` : "";
  return { message: `${error}.${stockNote}`.replace("..", "."), result: { status: "rejected", error }, executedArgs };
}

/**
 * Alat transaksi satu langkah: model cukup menulis nama barang, jumlah, arah, dan
 * lokasi seperti disebut staf. Kode yang mencari produk, memetakan lokasi, dan
 * mengeksekusi; hasilnya pesan deterministik, konfirmasi PIN, atau kartu pilihan.
 */
async function advanceMutation(
  toolName: MutationTool,
  args: Record<string, unknown>,
  userMessage: string,
  conversationId: string,
  businessId: string,
  getDevicePosition: () => Promise<GeoPoint | null>,
  /** Tindakan kode untuk "Lihat proses" (mis. "Lokasi diisi: Gudang"). */
  note: (text: string) => void = () => {},
): Promise<MutationOutcome> {
  if (!navigator.onLine) return { message: OFFLINE_MUTATION_MESSAGE, result: { status: "offline" } };

  const locations = await fetchTenantLocations();
  const locRef = (v: unknown) => (locations ? resolveLocationRef(v, locations)?.id ?? null : null);

  // 1. Produk: dari pilihan staf (product_id) atau dicari dari nama tulisan model.
  let product: ProductSearchResult | null = null;
  let productId = typeof args.product_id === "string" ? args.product_id : null;
  let productName = typeof args.product_name === "string" ? args.product_name : null;
  let modelProductId: string | null = null;
  if (!productId) {
    const query = String(args.product ?? args.product_name ?? "").trim();
    if (!query) return { message: "Barang apa yang mau dicatat?", result: { status: "product_missing" } };
    const search = await searchProducts(query, conversationId, businessId);
    if (search.fromCache) {
      return {
        message: "Pencarian barang ke server sedang gagal. Coba kirim ulang sebentar lagi.",
        result: { status: "product_search_failed", query },
      };
    }
    const pick = pickProduct(search.results);
    if (pick.status === "none") {
      return {
        message: `Barang "${query}" tidak ditemukan di data toko. Coba sebut nama lain atau nomor part-nya.`,
        result: { status: "product_not_found", query, search_results: search.results.length },
      };
    }
    if (pick.status === "ambiguous") {
      return {
        message: `Ada beberapa barang yang mirip "${query}". Pilih yang dimaksud di bawah.`,
        choice: {
          kind: "product",
          toolName,
          args,
          userMessage,
          options: pick.candidates.map((c) => ({ id: c.product_id, name: c.name, detail: describeStock(c) })),
        },
        result: { status: "product_choice_required", candidates: pick.candidates.map((c) => c.product_id) },
      };
    }
    product = pick.product;
    productId = product.product_id;
    productName = product.name;
    modelProductId = product.product_id;
    note(`Barang dicocokkan kode: ${product.name}`);
  }
  const name = productName ?? "barang ini";

  const quantity = Number(args.quantity);
  const reasoning = String(args.reasoning ?? "").trim() || userMessage;
  const resolvedArgs: Record<string, unknown> =
    toolName === "updateStock"
      ? {
          product_id: modelProductId,
          location_id: locRef(args.location ?? args.location_id),
          quantity: args.quantity,
          direction: args.direction,
        }
      : {
          product_id: modelProductId,
          quantity: args.quantity,
          from_location_id: locRef(args.from_location ?? args.from_location_id),
          to_location_id: locRef(args.to_location ?? args.to_location_id),
        };

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { message: `Berapa jumlah ${name} yang mau dicatat?`, result: { status: "quantity_missing" }, resolvedArgs };
  }
  if (!locations) {
    return { message: "Daftar lokasi toko tidak bisa dimuat. Coba lagi sebentar lagi.", result: { status: "locations_unavailable" }, resolvedArgs };
  }

  if (toolName === "updateStock") {
    const direction = String(args.direction ?? "").toLowerCase();
    if (direction !== "masuk" && direction !== "keluar") {
      return { message: `${name} mau dicatat masuk atau keluar?`, result: { status: "direction_missing" }, resolvedArgs };
    }
    const base = { product_id: productId, quantity, direction, reasoning };
    const resolved = resolveUpdateLocation({ location_id: args.location ?? args.location_id }, userMessage, locations);
    if (resolved === "choose") {
      const choice = buildLocationChoice(base, userMessage, locations, await getDevicePosition());
      return {
        message: locationChoiceMessage(choice, productName),
        choice,
        result: {
          status: "location_choice_required",
          suggested_location_id: choice.suggestedLocationId,
          suggestion_reason: choice.suggestionReason,
        },
        resolvedArgs,
      };
    }
    const locationId = resolved === "passthrough" ? null : resolved.locationId;
    const locationName = locations.find((l) => l.id === locationId)?.name;
    note(locationName ? `Lokasi diisi: ${locationName}` : "Lokasi diteruskan ke server untuk divalidasi");
    const outcome = await executeMutation(toolName, { ...base, location_id: locationId }, product, conversationId, businessId);
    return { ...outcome, resolvedArgs };
  }

  const { from, to } = resolveTransferLocations(args, userMessage, locations);
  if (!from || !to || from === to) {
    return {
      message: `Pindah ${name} dari mana ke mana? Sebutkan lokasi asal dan tujuannya, misalnya "dari gudang ke toko".`,
      result: { status: "transfer_locations_missing" },
      resolvedArgs,
    };
  }
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "lokasi";
  note(`Lokasi diisi: dari ${locName(from)} ke ${locName(to)}`);
  const outcome = await executeMutation(
    toolName,
    { product_id: productId, quantity, from_location_id: from, to_location_id: to, reasoning },
    product,
    conversationId,
    businessId,
  );
  return { ...outcome, resolvedArgs };
}

/**
 * Lanjutkan transaksi yang ditahan setelah staf memilih produk atau lokasi.
 * Deterministik, tanpa LLM; hasilnya masuk alur konfirmasi PIN yang sama.
 */
export async function submitMutationChoice(
  choice: MutationChoice,
  selectedId: string,
  conversationId: string,
  businessId: string,
  onStep?: (steps: ProcessStep[]) => void,
): Promise<{
  message: string;
  pendingConfirmation?: PendingConfirmation;
  choice?: MutationChoice;
  processSteps: ProcessStep[];
}> {
  const rec = new ProcessRecorder(onStep);
  const picked = choice.options.find((o) => o.id === selectedId);
  rec.add({
    kind: "action",
    label: `Staf memilih ${choice.kind === "location" ? "lokasi" : "barang"}: ${picked?.name ?? selectedId}`,
    status: "done",
  });
  const outcome =
    choice.kind === "location"
      ? await executeMutation(choice.toolName, { ...choice.args, location_id: selectedId }, null, conversationId, businessId)
      : await advanceMutation(
          choice.toolName,
          { ...choice.args, product_id: selectedId, product_name: picked?.name },
          choice.userMessage,
          conversationId,
          businessId,
          readDevicePosition,
          (text) => rec.add({ kind: "action", label: text, status: "done" }),
        );
  rec.add(mutationOutcomeStep(outcome.result));
  rec.add(answerStep("code"));
  return { ...outcome, processSteps: rec.steps };
}

interface NonStreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

/** Juga menjawab "apa yang bisa kamu lakukan?", yang oleh Router diarahkan ke OFF_TOPIC. */
export const OFF_TOPIC_REPLY =
  "Maaf, saya hanya bisa membantu urusan stok & suku cadang toko ini. Contohnya:\n" +
  '- Cek stok: "stok radiator di toko berapa?"\n' +
  '- Catat barang masuk/keluar: "masuk 10 filter oli di gudang"\n' +
  '- Pindah barang: "pindahkan 2 busi dari gudang ke toko"\n' +
  '- Tren penjualan: "penjualan radiator 6 bulan terakhir"';

const KNOWN_TOOL_NAMES = new Set<string>(AGENT_TOOL_DEFINITIONS.map((t) => t.function.name));

export const UNAVAILABLE_TOOL_REPLY =
  "Maaf, permintaan itu di luar kemampuan saya. Saya hanya bisa cek stok, melihat tren penjualan, " +
  "dan mencatat barang masuk/keluar/pindah lokasi (dengan konfirmasi PIN).";

async function routeMessage(
  engine: MLCEngineInterface,
  userMessage: string,
  history: ChatMessage[],
): Promise<{
  agentType: "query" | "transaction" | "off_topic";
  text: string;
  usage: NonStreamUsage | null;
}> {
  const lastAssistant = history.findLast((m) => m.role === "assistant")?.content;
  const completion = await engine.chat.completions.create({
    messages: [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: buildRouterInput(userMessage, lastAssistant) },
    ],
    temperature: 0,
  });
  const text = completion.choices[0]?.message?.content ?? "";
  const usage = (completion as unknown as { usage?: NonStreamUsage }).usage ?? null;
  return { agentType: parseRouterReply(text), text, usage };
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
  getDevicePosition: () => Promise<GeoPoint | null>,
  rec: ProcessRecorder,
  onToken?: (partialText: string) => void,
): Promise<AgentTurnResult> {
  const toolTrace: AgentTurnResult["toolTrace"] = [];
  // Mode single_agent: nilai ini placeholder, diganti inferAgentTypeFromTrace di runAgentTurn.
  let agentType: AgentTurnResult["agentType"] = "query";
  let systemPrompt = SINGLE_AGENT_SYSTEM_PROMPT;

  if (mode === "multi_agent") {
    const routing = rec.add({ kind: "route", label: "Router menentukan agent…", status: "running" });
    const routed = await routeMessage(engine, userMessage, history);
    agentType = routed.agentType;
    rec.finish(routing, routeStep(agentType));
    modelReplies.push(`[router] ${routed.text}`);
    if (routed.usage) {
      usageAcc.hasUsage = true;
      usageAcc.promptTokens += routed.usage.prompt_tokens ?? 0;
      usageAcc.completionTokens += routed.usage.completion_tokens ?? 0;
    }

    if (agentType === "off_topic") {
      rec.add(answerStep("code"));
      return {
        agentType,
        assistantText: OFF_TOPIC_REPLY,
        toolTrace,
      };
    }

    systemPrompt =
      agentType === "query"
        ? QUERY_AGENT_SYSTEM_PROMPT
        : TRANSACTION_AGENT_SYSTEM_PROMPT;
  } else {
    rec.add({ kind: "route", label: "Mode satu agent (baseline evaluasi), tanpa Router", status: "done" });
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
    // Hanya role & content: pesan di UI bisa membawa field lain (mis. trace).
    ...trimHistoryForContext(history).map(({ role, content }) => ({ role, content })),
    { role: "user", content: userMessage },
  ];

  let nudgedMissingCall = false;
  // Teks model sebelum diingatkan; dipakai bila balasan sesudahnya kosong.
  let textBeforeNudge = "";
  const rejectedTools = new Set<string>();
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
      messages.push({ role: "assistant", content: withClosedToolCall(content) });
      messages.push({ role: "user", content: MALFORMED_TOOL_CALL_FEEDBACK });
      rec.add(retryStep("malformed"));
      continue;
    }
    // Sama seperti di atas untuk "Saya akan panggil alat…" tanpa blok tool call.
    if (
      reply.calls.length === 0 &&
      !nudgedMissingCall &&
      toolTrace.length === 0 &&
      i < MAX_TOOL_ITERATIONS - 1 &&
      announcesToolCall(reply.text || content)
    ) {
      nudgedMissingCall = true;
      textBeforeNudge = (reply.text || content).trim();
      messages.push({ role: "assistant", content: withClosedToolCall(content) });
      messages.push({ role: "user", content: MISSING_TOOL_CALL_FEEDBACK });
      rec.add(retryStep("missing_call"));
      continue;
    }
    if (reply.calls.length === 0) {
      // Balasan kosong (Run 19, S-03 single: model diam sesudah diingatkan) tidak
      // boleh sampai ke staf sebagai pesan kosong.
      const modelText = (reply.text || (reply.malformed ? "" : content)).trim() || textBeforeNudge;
      rec.add(answerStep(modelText ? "model" : "code"));
      return {
        agentType,
        assistantText: modelText || "Maaf, saya kurang mengerti maksudnya. Bisa diulang?",
        toolTrace,
      };
    }

    messages.push({ role: "assistant", content: withClosedToolCall(content) });
    const responses: string[] = [];

    for (const call of reply.calls) {
      const args = call.arguments;
      const allowed = allowedTools.has(call.name);

      // Mutasi mengakhiri giliran: sisa alur (produk, lokasi, validasi, PIN)
      // deterministik, model tidak perlu merangkai langkah berikutnya.
      const start = toolStartStep(call.name, args);
      const running = rec.add(start);
      if (allowed && isMutationTool(call.name)) {
        const outcome = await advanceMutation(
          call.name,
          args,
          userMessage,
          conversationId,
          businessId,
          getDevicePosition,
          (text) => rec.add({ kind: "action", label: text, status: "done" }),
        );
        rec.finish(running, { ...start, label: `Model memanggil ${call.name}`, status: "done" });
        rec.add(mutationOutcomeStep(outcome.result));
        rec.add(answerStep("code"));
        toolTrace.push({
          name: call.name,
          args,
          result: outcome.result,
          ...(outcome.resolvedArgs && { resolvedArgs: outcome.resolvedArgs }),
          ...(outcome.executedArgs && { executedArgs: outcome.executedArgs }),
        });
        return {
          agentType,
          assistantText: outcome.message,
          pendingConfirmation: outcome.pendingConfirmation,
          choice: outcome.choice,
          toolTrace,
        };
      }

      const result = allowed
        ? await executeTool(call.name, args, conversationId, businessId)
        : { error: `Tool ${call.name} tidak tersedia untuk agent ini.` };
      toolTrace.push({ name: call.name, args, result });
      rec.finish(running, { ...start, label: start.label.replace(/…$/, ""), status: "done" });
      rec.add(toolResultStep(call.name, result));

      // Alat yang tidak ada sama sekali, atau alat agent lain yang diulang
      // setelah ditolak: model tidak akan berubah pikiran, jadi giliran diakhiri
      // kode alih-alih menghabiskan sisa iterasi.
      if (!allowed) {
        const unknownTool = !KNOWN_TOOL_NAMES.has(call.name);
        if (unknownTool || rejectedTools.has(call.name)) {
          rec.add(answerStep("code"));
          return { agentType, assistantText: UNAVAILABLE_TOOL_REPLY, toolTrace };
        }
        rejectedTools.add(call.name);
      }
      responses.push(formatToolResponse(call.name, result));
    }

    // Dikirim sebagai pesan user, bukan role 'tool': template chat model non-Hermes
    // di WebLLM belum tentu mendukung role 'tool' tanpa parameter `tools`.
    messages.push({ role: "user", content: responses.join("\n") });
  }

  rec.add(answerStep("fallback"));
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
  options: {
    mode?: AgentMode;
    /** Posisi perangkat untuk saran lokasi terdekat; /eval memakai posisi tetap. */
    getDevicePosition?: () => Promise<GeoPoint | null>;
    /** Langkah "Lihat proses" secara live; hasil akhirnya juga ada di processSteps. */
    onStep?: (steps: ProcessStep[]) => void;
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
  const usageAcc = { promptTokens: 0, completionTokens: 0, hasUsage: false };
  const modelReplies: string[] = [];
  const rec = new ProcessRecorder(options.onStep);

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
      processSteps: rec.steps,
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
