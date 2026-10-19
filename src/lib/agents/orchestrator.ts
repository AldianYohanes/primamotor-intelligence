"use client";

import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import {
  TurnStoppedError,
  type AgentMode,
  type AgentTurnResult,
  type ChatMessage,
  type MutationChoice,
  type MutationOutcome,
  type MutationTool,
  type PendingConfirmation,
} from "@/src/lib/agents/turn/types";
import { ROUTER_SYSTEM_PROMPT, buildRouterInput, parseRouterReply } from "@/src/lib/agents/prompts/router";
import { QUERY_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/query-agent";
import { TRANSACTION_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/transaction-agent";
import { SINGLE_AGENT_SYSTEM_PROMPT } from "@/src/lib/agents/prompts/single-agent";
import { buildNeutralPadding, isPromptPaddingOn, paddingLength } from "@/src/lib/agents/prompt-padding";
import { AGENT_TOOL_DEFINITIONS } from "@/src/lib/agents/tool-schemas";
import {
  MALFORMED_TOOL_CALL_FEEDBACK,
  MISSING_TOOL_CALL_FEEDBACK,
  missingToolCallFeedback,
  type ToolSuggestion,
  announcesToolCall,
  buildToolInstructions,
  formatToolResponse,
  parseModelReply,
} from "@/src/lib/agents/tool-protocol";
import { interruptOnAbort, streamChatCompletion } from "@/src/lib/agents/turn/stream";
import { reportAgentExecutionMetric } from "@/src/lib/agents/turn/metrics";
import {
  CODE_REPLIES,
  OFFLINE_MUTATION_MESSAGE,
  UNAVAILABLE_TOOL_REPLY,
  UNBACKED_STOCK_REPLY,
} from "@/src/lib/agents/turn/replies";
import {
  executeTool,
  fetchTenantLocations,
  isMutationTool,
  runSalesTrend,
  searchProducts,
} from "@/src/lib/agents/turn/tools";
import { getActiveModelId } from "@/src/lib/agents/webllm-engine";
import {
  buildLocationChoice,
  locationChoiceMessage,
  mentionedTwoStoreLocations,
  readDevicePosition,
  resolveLocationRef,
  resolveTransferLocations,
  resolveUpdateLocation,
  twoLocationsFeedback,
  twoLocationsSuggestion,
  type GeoPoint,
} from "@/src/lib/agents/location-choice";
import {
  compactStockResult,
  describeStock,
  largeQuantityWarning,
  pickProduct,
  type ProductSearchResult,
} from "@/src/lib/agents/product-resolution";
import { trimHistoryForContext } from "@/src/lib/agents/history-window";
import { offTopicReply } from "@/src/lib/agents/off-topic";
import {
  dropPinSentences,
  isReadOnlyTurn,
  mentionsPinConfirmation,
  READ_ONLY_PIN_FEEDBACK,
  staffMentionsPin,
} from "@/src/lib/agents/read-only-reply";
import { agentInputMessage, normalizeShorthand } from "@/src/lib/agents/normalize-shorthand";
import { guardRoute } from "@/src/lib/agents/route-guard";
import { agentHistory, routerContext } from "@/src/lib/agents/router-context";
import {
  cacheNoteFor,
  isOfflineNoMatch,
  looksUnbacked,
  mentionsStockMovement,
  offlineNoMatchReply,
} from "@/src/lib/agents/offline-answers";
import { claimsRecorded, contradictsStock, stockReply, summarizeStock } from "@/src/lib/agents/stock-summary";
import { contradictsTrend, summarizeTrend, trendFactsText, trendReply } from "@/src/lib/agents/trend-summary";
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
export { UNAVAILABLE_TOOL_REPLY, UNBACKED_STOCK_REPLY } from "@/src/lib/agents/turn/replies";
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

const MAX_TOOL_ITERATIONS = 4;

const AGENT_TOOLS_BY_TYPE: Record<"query" | "transaction" | "off_topic", string[]> = {
  query: ["getStock", "getSalesTrend"],
  transaction: ["getStock", "updateStock", "transferStock"],
  off_topic: [],
};

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
    const warning =
      toolName === "updateStock" && executedArgs.direction === "masuk"
        ? largeQuantityWarning(Number(executedArgs.quantity), product)
        : null;
    return {
      message: warning ? `${result.message}\n${warning}` : result.message,
      pendingConfirmation: {
        audit_log_id: result.audit_log_id,
        tool_name: toolName,
        message: result.message,
        ...(warning && { warning }),
      },
      result: { status: "pending_confirmation", audit_log_id: result.audit_log_id, ...(warning && { warning }) },
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
  /** Pesan asli staf (sebelum singkatan diluruskan); disimpan sebagai alasan di audit log. */
  originalMessage: string = userMessage,
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
          originalMessage,
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
  const reasoning = String(args.reasoning ?? "").trim() || originalMessage;
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

  // Angka ≤ 0 yang ditulis (mis. "keluar -5") dibedakan dari jumlah yang tidak disebut.
  if (Number.isFinite(quantity) && args.quantity !== undefined && args.quantity !== null && args.quantity !== "" && quantity <= 0) {
    return {
      message: `Jumlah harus lebih dari 0. Berapa ${name} yang mau dicatat?`,
      result: { status: "quantity_invalid", quantity },
      resolvedArgs,
    };
  }
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
          choice.originalMessage ?? choice.userMessage,
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
export { OFF_TOPIC_REPLY } from "@/src/lib/agents/off-topic";

const KNOWN_TOOL_NAMES = new Set<string>(AGENT_TOOL_DEFINITIONS.map((t) => t.function.name));

async function routeMessage(
  engine: MLCEngineInterface,
  userMessage: string,
  history: ChatMessage[],
  signal?: AbortSignal,
): Promise<{
  agentType: "query" | "transaction" | "off_topic";
  text: string;
  usage: NonStreamUsage | null;
}> {
  // Balasan kode (off-topic, butuh koneksi, dst.) tidak ikut jadi konteks Router.
  const lastAssistant = routerContext(history, CODE_REPLIES);
  if (signal?.aborted) throw new TurnStoppedError();
  const stopListening = interruptOnAbort(engine, signal);
  let completion: Awaited<ReturnType<typeof engine.chat.completions.create>>;
  try {
    completion = await engine.chat.completions.create({
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        // Singkatan diluruskan hanya untuk Router; agent dan riwayat tetap teks asli.
        { role: "user", content: buildRouterInput(normalizeShorthand(userMessage), lastAssistant) },
      ],
      temperature: 0,
    });
  } finally {
    stopListening();
  }
  if (signal?.aborted) throw new TurnStoppedError();
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
  meta: { routerAgentType?: AgentTurnResult["agentType"] },
  onToken?: (partialText: string) => void,
  signal?: AbortSignal,
): Promise<AgentTurnResult> {
  const toolTrace: AgentTurnResult["toolTrace"] = [];
  // Agent membaca kata utuh ("klr" → "keluar"); riwayat dan balasan kode tetap teks asli.
  const agentMessage = agentInputMessage(userMessage);
  // Mode single_agent: nilai ini placeholder, diganti inferAgentTypeFromTrace di runAgentTurn.
  let agentType: AgentTurnResult["agentType"] = "query";
  let systemPrompt = SINGLE_AGENT_SYSTEM_PROMPT;

  if (mode === "multi_agent") {
    const routing = rec.add({ kind: "route", label: "Router menentukan agent…", status: "running" });
    const routed = await routeMessage(engine, userMessage, history, signal);
    agentType = routed.agentType;
    meta.routerAgentType = routed.agentType;
    rec.finish(routing, routeStep(agentType, routed.text));
    // Pengaman kode: pesan yang jelas berisi pencatatan barang tidak boleh berhenti
    // di Query Agent karena Router salah menebak (T-10).
    const guarded = guardRoute(agentType, userMessage);
    if (guarded.reason) {
      agentType = guarded.agentType;
      rec.add({ kind: "route", label: guarded.reason, status: "done" });
    }
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
        assistantText: offTopicReply(userMessage),
        toolTrace,
      };
    }

    // Transaksi butuh server (verifikasi PIN); saat offline dijawab kode tanpa
    // memanggil model (uji M4 9 Okt: model gagal menulis tool call 3× lalu
    // jawaban cadangan yang tidak menjelaskan alasannya).
    if (agentType === "transaction" && typeof navigator !== "undefined" && !navigator.onLine) {
      if (mentionsStockMovement(agentMessage)) {
        rec.add({ kind: "action", label: "Sedang offline, transaksi tidak dikirim", status: "failed" });
        rec.add(answerStep("code"));
        return { agentType, assistantText: OFFLINE_MUTATION_MESSAGE, toolTrace };
      }
      // Pertanyaan tanpa kata pergerakan barang ("stok busi bosch?") yang dinilai
      // transaksi: saat offline dibaca sebagai cek stok dari cache, bukan ditolak.
      agentType = "query";
      rec.add({ kind: "action", label: "Offline dan pesan tidak menyebut pergerakan barang, dibaca sebagai cek stok", status: "done" });
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
  let systemContent = `${systemPrompt}\n\n${buildToolInstructions(tools)}`;
  if (mode === "multi_agent" && isPromptPaddingOn()) {
    // Ablasi /eval: samakan panjang prompt spesialis dengan prompt single-agent.
    const singleLength = `${SINGLE_AGENT_SYSTEM_PROMPT}\n\n${buildToolInstructions(AGENT_TOOL_DEFINITIONS)}`.length;
    const padding = buildNeutralPadding(paddingLength(singleLength - systemContent.length - 2));
    if (padding) systemContent = `${systemContent}\n\n${padding}`;
  }
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemContent,
    },
    // Hanya role & content: pesan di UI bisa membawa field lain (mis. trace).
    // Tanpa balasan kode (model cenderung menyalinnya, uji M4 9 Okt).
    ...trimHistoryForContext(agentHistory(history, CODE_REPLIES)).map(({ role, content }) => ({ role, content })),
    { role: "user", content: agentMessage },
  ];

  let nudgedMissingCall = false;
  let nudgedUnbacked = false;
  let nudgedReadOnlyPin = false;
  // Pernah terlihat jawaban "konfirmasi PIN" padahal agent hanya membaca stok (H-14).
  let readOnlyPinSeen = false;
  let sawMalformed = false;
  let checkedTwoLocations = false;
  // Alat yang disarankan umpan balik pengaman sebelumnya; dipakai sebagai contoh di pengingat.
  let suggestedNext: ToolSuggestion | null = null;
  // Teks model sebelum diingatkan; dipakai bila balasan sesudahnya kosong.
  let textBeforeNudge = "";
  const rejectedTools = new Set<string>();
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const { content, usage } = await streamChatCompletion(engine, messages, onToken, signal);
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
      rec.add(retryStep("malformed"));
      sawMalformed = true;
      continue;
    }
    // Q-03: sesudah blok rusak, model minta maaf dengan teks tanpa memanggil alat
    // dan Query Agent belum membaca data apa pun. Diingatkan sekali (pakai penanda
    // nudgedMissingCall yang sama, jadi total iterasi tetap dibatasi MAX_TOOL_ITERATIONS).
    if (
      reply.calls.length === 0 &&
      sawMalformed &&
      !nudgedMissingCall &&
      agentType === "query" &&
      toolTrace.length === 0 &&
      i < MAX_TOOL_ITERATIONS - 1
    ) {
      nudgedMissingCall = true;
      textBeforeNudge = (reply.text || content).trim();
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: MISSING_TOOL_CALL_FEEDBACK });
      rec.add(retryStep("missing_call"));
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
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: missingToolCallFeedback(suggestedNext) });
      rec.add(retryStep("missing_call"));
      continue;
    }
    // Query Agent menyebut angka tanpa pernah membaca data (uji M4 9 Okt: stok
    // "busi bosch" dikarang lengkap dengan klaim "dari cache"). Diingatkan sekali;
    // kalau tetap tanpa alat, jawabannya diganti kode (lihat di bawah).
    const readsData = toolTrace.some((t) => t.name === "getStock" || t.name === "getSalesTrend");
    const unbackedNumbers =
      reply.calls.length === 0 && mode === "multi_agent" && agentType === "query" && !readsData && looksUnbacked(reply.text);
    if (unbackedNumbers && !nudgedUnbacked && i < MAX_TOOL_ITERATIONS - 1) {
      nudgedUnbacked = true;
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: MISSING_TOOL_CALL_FEEDBACK });
      rec.add(retryStep("unbacked_numbers"));
      continue;
    }
    if (unbackedNumbers) {
      rec.add(answerStep("unbacked"));
      return { agentType, assistantText: UNBACKED_STOCK_REPLY, toolTrace };
    }
    // H-14: agent hanya memanggil alat baca (mutasi mengakhiri giliran, jadi jejak
    // berisi alat baca saja) lalu menulis "konfirmasi dengan PIN". Tidak ada PIN
    // yang diminta sistem: diperlakukan sebagai jawaban query. Dilewati kalau staf
    // sendiri menyebut PIN (mis. "tidak perlu PIN"): jawaban soal PIN itu sah.
    // Nama barang yang memuat kata "pin" (pin piston) dari hasil getStock tidak dihitung.
    const pinProductNames = toolTrace
      .filter((t) => t.name === "getStock")
      .flatMap((t) => summarizeStock(t.result)?.products.map((p) => p.name) ?? []);
    const readOnlyPin =
      reply.calls.length === 0 &&
      toolTrace.length > 0 &&
      !staffMentionsPin(userMessage) &&
      mentionsPinConfirmation(reply.text || content, pinProductNames);
    if (readOnlyPin) readOnlyPinSeen = true;
    if (readOnlyPin && !nudgedReadOnlyPin && i < MAX_TOOL_ITERATIONS - 1) {
      nudgedReadOnlyPin = true;
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: READ_ONLY_PIN_FEEDBACK });
      rec.add(retryStep("read_only_pin"));
      continue;
    }
    if (reply.calls.length === 0) {
      // Giliran transaksi yang ternyata hanya membaca stok dilabeli "query", dengan
      // atau tanpa jawaban yang menyebut PIN. Tebakan asli Router tetap tersimpan
      // di routerAgentType (akurasi "Router saja").
      if (agentType === "transaction" && (readOnlyPinSeen || isReadOnlyTurn(toolTrace))) {
        agentType = "query";
        rec.add({ kind: "route", label: "Tidak ada pencatatan stok, giliran dibaca sebagai pertanyaan stok (Query Agent)", status: "done" });
      }
      // Balasan kosong (Run 19, S-03 single: model diam sesudah diingatkan) tidak
      // boleh sampai ke staf sebagai pesan kosong.
      const rawText = (reply.text || (reply.malformed ? "" : content)).trim();
      const modelText = (readOnlyPin ? dropPinSentences(rawText, pinProductNames) : rawText) || textBeforeNudge;
      // Jawaban dari cache offline selalu diberi keterangan oleh kode (model sering lupa).
      const cacheNote = modelText ? cacheNoteFor(toolTrace) : null;
      // Q-13: jawaban tren yang bertentangan dengan hitungan kode diganti kalimat dari kode.
      const trendTrace = [...toolTrace].reverse().find((t) => t.name === "getSalesTrend");
      const trendSummary = trendTrace ? summarizeTrend(trendTrace.result) : null;
      if (modelText && trendSummary && contradictsTrend(modelText, trendSummary)) {
        rec.add(answerStep("code"));
        const productName = String((trendTrace?.result as { product_name?: unknown })?.product_name ?? "");
        return { agentType, assistantText: trendReply(trendSummary, productName), toolTrace };
      }
      // Q-07: jawaban pembacaan stok yang bertentangan dengan getStock (mis. "kosong di
      // semua lokasi" saat Gudang 2, atau mengaku "sudah dicatat") diganti kalimat dari kode.
      const stockTrace = [...toolTrace].reverse().find((t) => t.name === "getStock");
      const stockSummary = stockTrace && !trendTrace ? summarizeStock(stockTrace.result) : null;
      // Semua kalimat jawaban ternyata permintaan PIN: datanya diambil dari getStock.
      if (!modelText && readOnlyPin && stockSummary) {
        rec.add(answerStep("code"));
        const stockText = stockReply(stockSummary);
        const note = cacheNoteFor(toolTrace);
        return { agentType, assistantText: note ? `${stockText}\n\n${note}` : stockText, toolTrace };
      }
      if (modelText && stockSummary && contradictsStock(modelText, stockSummary)) {
        rec.add(answerStep("code"));
        const reply = stockReply(stockSummary, { notRecorded: claimsRecorded(modelText) });
        return { agentType, assistantText: cacheNote ? `${reply}

${cacheNote}` : reply, toolTrace };
      }
      rec.add(answerStep(!modelText ? "code" : toolTrace.length > 0 ? "model" : "model_no_tool"));
      return {
        agentType,
        assistantText: cacheNote
          ? `${modelText}\n\n${cacheNote}`
          : modelText || "Maaf, saya kurang mengerti maksudnya. Bisa diulang?",
        toolTrace,
      };
    }

    messages.push({ role: "assistant", content });
    const responses: string[] = [];

    for (const call of reply.calls) {
      // Sesudah stop, tidak ada alat yang boleh dijalankan lagi.
      if (signal?.aborted) throw new TurnStoppedError();
      const args = call.arguments;
      const allowed = allowedTools.has(call.name);

      // T-07: "Toko butuh 2 …, ambil dari gudang" dicatat model sebagai updateStock
      // keluar di gudang. Bila pesan menyebut toko dan gudang sekaligus, model diberi
      // satu kali umpan balik (bukan ditolak); kalau tetap updateStock, dijalankan.
      if (
        allowed &&
        call.name === "updateStock" &&
        mode === "multi_agent" &&
        !checkedTwoLocations &&
        i < MAX_TOOL_ITERATIONS - 1
      ) {
        checkedTwoLocations = true;
        const locations = await fetchTenantLocations();
        const two = locations ? mentionedTwoStoreLocations(agentMessage, locations) : null;
        if (two) {
          suggestedNext = twoLocationsSuggestion(args, two);
          rec.add(retryStep("two_locations"));
          responses.push(twoLocationsFeedback(two));
          continue;
        }
      }

      // Mutasi mengakhiri giliran: sisa alur (produk, lokasi, validasi, PIN)
      // deterministik, model tidak perlu merangkai langkah berikutnya.
      const start = toolStartStep(call.name, args);
      const running = rec.add(start);
      if (allowed && isMutationTool(call.name)) {
        const outcome = await advanceMutation(
          call.name,
          args,
          agentMessage,
          conversationId,
          businessId,
          getDevicePosition,
          (text) => rec.add({ kind: "action", label: text, status: "done" }),
          userMessage,
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

      let resolvedArgs: Record<string, unknown> | undefined;
      let result: unknown;
      if (!allowed) {
        result = { error: `Tool ${call.name} tidak tersedia untuk agent ini.` };
      } else if (call.name === "getSalesTrend") {
        ({ result, resolvedArgs } = await runSalesTrend(args, conversationId, businessId, agentMessage));
      } else {
        result = await executeTool(call.name, args, conversationId, businessId);
      }
      toolTrace.push({ name: call.name, args, result, ...(resolvedArgs && { resolvedArgs }) });
      rec.finish(running, { ...start, label: start.label.replace(/…$/, ""), status: "done" });
      rec.add(toolResultStep(call.name, result));

      // Offline dan barangnya tidak ada di cache: jawaban disusun kode supaya tidak
      // terbaca "stok kosong" (uji M4 9 Okt, model menjawab "tidak tersedia").
      if (call.name === "getStock" && isOfflineNoMatch(result)) {
        rec.add(answerStep("code"));
        return { agentType, assistantText: offlineNoMatchReply(String(args.query ?? "")), toolTrace };
      }

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
      // Model menerima versi ringkas; toolTrace di atas tetap menyimpan hasil lengkap.
      responses.push(formatToolResponse(call.name, call.name === "getStock" ? compactStockResult(result) : result));
      // Q-13: arah tren dan bulan tertinggi dihitung kode, model hanya menyampaikannya.
      const trendSummary = call.name === "getSalesTrend" ? summarizeTrend(result) : null;
      if (trendSummary) responses.push(trendFactsText(trendSummary));
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
    /** Batalkan untuk menghentikan giliran; runAgentTurn melempar TurnStoppedError. */
    signal?: AbortSignal;
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
