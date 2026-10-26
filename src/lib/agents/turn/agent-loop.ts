import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import {
  TurnStoppedError,
  type AgentMode,
  type AgentTurnResult,
  type ChatMessage,
} from "@/src/lib/agents/turn/types";
import { composeFinalAnswer, hasCodeAnswer } from "@/src/lib/agents/turn/final-answer";
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
  parseFunctionStyleCall,
  parseModelReply,
  stripThinking,
} from "@/src/lib/agents/tool-protocol";
import { applyCorrections, missingCallSuggestion, transferCallFrom } from "@/src/lib/agents/tool-correction";
import { getModelProfile } from "@/src/lib/agents/model-profile";
import { getActiveModelId } from "@/src/lib/agents/webllm-engine";
import { streamChatCompletion } from "@/src/lib/agents/turn/stream";
import type { InferenceMeter } from "@/src/lib/agents/inference-stats";
import {
  CODE_REPLIES,
  OFFLINE_MUTATION_MESSAGE,
  UNAVAILABLE_TOOL_REPLY,
  UNBACKED_STOCK_REPLY,
} from "@/src/lib/agents/turn/replies";
import { routeMessage } from "@/src/lib/agents/turn/router-step";
import { advanceMutation } from "@/src/lib/agents/turn/mutation";
import {
  executeTool,
  fetchTenantLocations,
  isMutationTool,
  runSalesTrend,
} from "@/src/lib/agents/turn/tools";
import {
  mentionedTwoStoreLocations,
  twoLocationsFeedback,
  twoLocationsSuggestion,
  type GeoPoint,
} from "@/src/lib/agents/location-choice";
import {
  compactStockResult,
} from "@/src/lib/agents/product-resolution";
import { trimHistoryForContext } from "@/src/lib/agents/history-window";
import { offTopicReply } from "@/src/lib/agents/off-topic";
import {
  mentionsPinConfirmation,
  READ_ONLY_PIN_FEEDBACK,
  staffMentionsPin,
} from "@/src/lib/agents/read-only-reply";
import { agentInputMessage } from "@/src/lib/agents/normalize-shorthand";
import { guardRoute, isClearStockMovement, looksStockRelated } from "@/src/lib/agents/route-guard";
import { agentHistory } from "@/src/lib/agents/router-context";
import {
  isOfflineNoMatch,
  looksUnbacked,
  mentionsStockMovement,
  offlineNoMatchReply,
} from "@/src/lib/agents/offline-answers";
import { summarizeStock } from "@/src/lib/agents/stock-summary";
import { summarizeTrend, trendFactsText } from "@/src/lib/agents/trend-summary";
import {
  ProcessRecorder,
  answerStep,
  mutationOutcomeStep,
  retryStep,
  routeStep,
  toolResultStep,
  toolStartStep,
} from "@/src/lib/agents/process-trace";

export const MAX_TOOL_ITERATIONS = 4;


export const AGENT_TOOLS_BY_TYPE: Record<"query" | "transaction" | "off_topic", string[]> = {
  query: ["getStock", "getSalesTrend"],
  transaction: ["getStock", "updateStock", "transferStock"],
  off_topic: [],
};
export const KNOWN_TOOL_NAMES = new Set<string>(AGENT_TOOL_DEFINITIONS.map((t) => t.function.name));

/**
 * Jalankan tool-calling loop + routing tanpa instrumentasi metrics — dipisah dari
 * runAgentTurn (pembungkusnya) supaya logika timing/reporting di bawah tidak
 * bercampur dengan logika percakapan itu sendiri. Token usage diakumulasi lewat
 * parameter `usageAcc` (side effect terkontrol, satu-satunya alasan dipisah jadi
 * fungsi sendiri alih-alih inline).
 */
export async function runAgentTurnInner(
  engine: MLCEngineInterface,
  history: ChatMessage[],
  userMessage: string,
  conversationId: string,
  businessId: string,
  usageAcc: { promptTokens: number; completionTokens: number; hasUsage: boolean; meter?: InferenceMeter },
  mode: AgentMode,
  modelReplies: string[],
  getDevicePosition: () => Promise<GeoPoint | null>,
  rec: ProcessRecorder,
  meta: { routerAgentType?: AgentTurnResult["agentType"]; routedByCode?: boolean },
  onToken?: (partialText: string) => void,
  signal?: AbortSignal,
): Promise<AgentTurnResult> {
  const toolTrace: AgentTurnResult["toolTrace"] = [];
  // Pengaman tambahan hanya untuk model dengan profil khusus (model-profile.ts).
  const modelProfile = getModelProfile(getActiveModelId());
  // Agent membaca kata utuh ("klr" → "keluar"); riwayat dan balasan kode tetap teks asli.
  const agentMessage = agentInputMessage(userMessage);
  // Mode single_agent: nilai ini placeholder, diganti inferAgentTypeFromTrace di runAgentTurn.
  let agentType: AgentTurnResult["agentType"] = "query";
  let systemPrompt = SINGLE_AGENT_SYSTEM_PROMPT;

  if (mode === "multi_agent") {
    if (modelProfile.skipRouterForMovement && isClearStockMovement(userMessage)) {
      // guardRoute selalu mengalihkan pesan seperti ini ke transaksi apa pun tebakan Router,
      // jadi memanggil Router hanya menambah waktu (sekitar 13 detik di Qwen3 1.7B).
      agentType = "transaction";
      meta.routedByCode = true;
      rec.add({ kind: "route", label: "Pesan jelas berisi pencatatan barang dan jumlah: dirutekan kode ke Transaction Agent, Router dilewati", status: "done" });
    } else {
      const routing = rec.add({ kind: "route", label: "Router menentukan agent…", status: "running" });
      const routerCall = usageAcc.meter?.startCall("Router");
      const routed = await routeMessage(engine, userMessage, history, signal);
      if (routerCall !== undefined) usageAcc.meter?.finishCall(routerCall, routed.usage);
      agentType = routed.agentType;
      meta.routerAgentType = routed.agentType;
      rec.finish(routing, routeStep(agentType, stripThinking(routed.text)));
      // Pengaman kode: pesan yang jelas berisi pencatatan barang tidak boleh berhenti
      // di Query Agent karena Router salah menebak (T-10).
      const guarded = guardRoute(agentType, userMessage, { catalog: modelProfile.catalogRouting });
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

  // Balasan yang akan diulang tidak boleh tetap tampil ke staf selama model menyusun ulang.
  const retry = (kind: Parameters<typeof retryStep>[0]) => {
    onToken?.("");
    rec.add(retryStep(kind));
  };
  const agentRecovery = modelProfile.agentRecovery;
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
    const agentCall = usageAcc.meter?.startCall("Agent");
    const { content, usage } = await streamChatCompletion(
      engine,
      messages,
      onToken,
      signal,
      agentCall === undefined ? undefined : () => usageAcc.meter?.tick(agentCall),
      modelProfile.maxAgentTokens ?? undefined,
    );
    if (agentCall !== undefined) usageAcc.meter?.finishCall(agentCall, usage);
    if (usage) {
      usageAcc.hasUsage = true;
      usageAcc.promptTokens += usage.prompt_tokens ?? 0;
      usageAcc.completionTokens += usage.completion_tokens ?? 0;
    }

    modelReplies.push(content);
    let reply = parseModelReply(content);
    // Teks tampil/cek tanpa blok <think>; `content` mentah tetap dipakai untuk riwayat.
    const shownContent = stripThinking(content);
    if (agentRecovery && reply.calls.length === 0 && !reply.malformed) {
      const styled = parseFunctionStyleCall(shownContent, allowedTools);
      if (styled) {
        reply = { text: "", calls: [styled], malformed: false };
        rec.add({ kind: "action", label: `Panggilan ${styled.name} ditulis seperti kode, dibaca sebagai tool call`, status: "done" });
      }
    }
    // Model kecil kadang menulis JSON tool call yang rusak; beri satu kesempatan
    // memperbaiki selama masih ada sisa iterasi, alih-alih langsung menyerah.
    if (reply.calls.length === 0 && reply.malformed && i < MAX_TOOL_ITERATIONS - 1) {
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: MALFORMED_TOOL_CALL_FEEDBACK });
      retry("malformed");
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
      textBeforeNudge = (reply.text || shownContent).trim();
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: MISSING_TOOL_CALL_FEEDBACK });
      retry("missing_call");
      continue;
    }
    // Sama seperti di atas untuk "Saya akan panggil alat…" tanpa blok tool call.
    if (
      reply.calls.length === 0 &&
      !nudgedMissingCall &&
      toolTrace.length === 0 &&
      i < MAX_TOOL_ITERATIONS - 1 &&
      announcesToolCall(reply.text || shownContent)
    ) {
      nudgedMissingCall = true;
      textBeforeNudge = (reply.text || shownContent).trim();
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: missingToolCallFeedback(suggestedNext) });
      retry("missing_call");
      continue;
    }
    // Qwen3 1.7B menjawab pertanyaan stok dari ingatan atau menyalin pesan staf tanpa memanggil
    // alat (Q-06, Q-07, H-15, H-18 pada run 23 Okt 2026; H-18 mengarang "10 unit"). Ditegur sekali.
    const missing = modelProfile.nudgeMissingCall && reply.calls.length === 0 && !nudgedMissingCall && toolTrace.length === 0 ? missingCallSuggestion(userMessage, { catalog: modelProfile.catalogRouting }) : null;
    if (missing && i < MAX_TOOL_ITERATIONS - 1) {
      nudgedMissingCall = true;
      textBeforeNudge = (reply.text || shownContent).trim();
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: missingToolCallFeedback(missing.suggestion ?? suggestedNext) });
      retry("missing_call");
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
      retry("unbacked_numbers");
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
      mentionsPinConfirmation(reply.text || shownContent, pinProductNames);
    if (readOnlyPin) readOnlyPinSeen = true;
    if (readOnlyPin && !nudgedReadOnlyPin && i < MAX_TOOL_ITERATIONS - 1) {
      nudgedReadOnlyPin = true;
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: READ_ONLY_PIN_FEEDBACK });
      retry("read_only_pin");
      continue;
    }
    if (reply.calls.length === 0) {
      return composeFinalAnswer({
        agentType,
        toolTrace,
        reply,
        content,
        readOnlyPin,
        readOnlyPinSeen,
        pinProductNames,
        textBeforeNudge,
        rec,
        answerFromToolResult: modelProfile.answerFromToolResult,
      });
    }

    messages.push({ role: "assistant", content });
    const responses: string[] = [];

    for (const writtenCall of reply.calls) {
      // Sesudah stop, tidak ada alat yang boleh dijalankan lagi.
      if (signal?.aborted) throw new TurnStoppedError();
      const corrected = agentRecovery ? applyCorrections(writtenCall, agentMessage, allowedTools) : { call: writtenCall, note: null };
      let call = corrected.call;
      if (corrected.note) rec.add({ kind: "action", label: corrected.note, status: "done" });
      // T-07, H-08: "ambil dari gudang" untuk toko dicatat model sebagai updateStock. Profil model
      // kecil membacanya dari kata depan dan langsung menjadikannya transferStock.
      if (agentRecovery && call.name === "updateStock" && allowedTools.has("transferStock")) {
        const locations = await fetchTenantLocations();
        const two = locations ? mentionedTwoStoreLocations(agentMessage, locations) : null;
        const asTransfer = two ? transferCallFrom(call, agentMessage, two) : null;
        if (asTransfer) {
          call = asTransfer.call;
          if (asTransfer.note) rec.add({ kind: "action", label: asTransfer.note, status: "done" });
        }
      }
      // H-36: single-agent tidak punya Router dan memanggil getStock untuk "nomor telepon bengkel
      // terdekat". Sebelum alat baca pertama jalan, pesan tanpa kaitan stok dijawab kode sebagai
      // off-topic, seperti jalur OFF_TOPIC di multi-agent.
      if (
        agentRecovery &&
        mode === "single_agent" &&
        toolTrace.length === 0 &&
        (call.name === "getStock" || call.name === "getSalesTrend") &&
        !looksStockRelated(userMessage, { catalog: modelProfile.catalogRouting })
      ) {
        rec.add({ kind: "route", label: "Pesan tidak berkaitan dengan stok: dijawab kode sebagai di luar topik, alat tidak dipanggil", status: "done" });
        rec.add(answerStep("code"));
        return { agentType: "off_topic", assistantText: offTopicReply(userMessage), toolTrace };
      }
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
          retry("two_locations");
          responses.push(twoLocationsFeedback(two));
          continue;
        }
      }

      // Qwen3.5 0.8B (Q-01): sesudah hasil getStock, model menulis ulang percakapan dan memanggil alat
      // yang sama lagi sampai iterasi habis. Alat baca yang sama persis tidak dijalankan ulang; hasil
      // sebelumnya sudah cukup, jadi giliran dijawab dari hasil itu.
      if (
        modelProfile.answerFromToolResult &&
        allowed &&
        (call.name === "getStock" || call.name === "getSalesTrend") &&
        toolTrace.some((t) => t.name === call.name && JSON.stringify(t.args) === JSON.stringify(args)) &&
        hasCodeAnswer(toolTrace)
      ) {
        rec.add({ kind: "action", label: `Model memanggil ${call.name} lagi dengan argumen sama, dijawab dari hasil sebelumnya`, status: "done" });
        return composeFinalAnswer({
          agentType,
          toolTrace,
          reply: { text: "", calls: [], malformed: false },
          content: "",
          readOnlyPin: false,
          readOnlyPinSeen,
          pinProductNames: [],
          textBeforeNudge: "",
          rec,
          answerFromToolResult: true,
        });
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
        ({ result, resolvedArgs } = await runSalesTrend(args, conversationId, businessId, agentMessage, agentRecovery));
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
