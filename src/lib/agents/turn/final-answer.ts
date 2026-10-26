import { dropPinSentences, isReadOnlyTurn } from "@/src/lib/agents/read-only-reply";
import { cacheNoteFor } from "@/src/lib/agents/offline-answers";
import { claimsRecorded, contradictsStock, stockReply, summarizeStock } from "@/src/lib/agents/stock-summary";
import { contradictsTrend, summarizeTrend, trendReply } from "@/src/lib/agents/trend-summary";
import { ProcessRecorder, answerStep } from "@/src/lib/agents/process-trace";
import { isDegenerateAnswer } from "@/src/lib/agents/answer-quality";
import { stripThinking, type ParsedReply } from "@/src/lib/agents/tool-protocol";
import type { AgentTurnResult } from "@/src/lib/agents/turn/types";

/**
 * Jawaban akhir giliran (model tidak memanggil alat lagi): teks model dipakai apa
 * adanya kecuali bertentangan dengan data alat, lalu diganti kalimat dari kode.
 */
export function composeFinalAnswer({
  agentType,
  toolTrace,
  reply,
  content,
  readOnlyPin,
  readOnlyPinSeen,
  pinProductNames,
  textBeforeNudge,
  rec,
  answerFromToolResult = true,
}: {
  agentType: AgentTurnResult["agentType"];
  toolTrace: AgentTurnResult["toolTrace"];
  reply: ParsedReply;
  content: string;
  readOnlyPin: boolean;
  readOnlyPinSeen: boolean;
  pinProductNames: string[];
  textBeforeNudge: string;
  rec: ProcessRecorder;
  /** Profil model: jawaban kosong sesudah alat baca dijawab dari hasil alat (model-profile.ts). */
  answerFromToolResult?: boolean;
}): Pick<AgentTurnResult, "agentType" | "assistantText" | "toolTrace"> {
  // Giliran transaksi yang ternyata hanya membaca stok dilabeli "query", dengan
  // atau tanpa jawaban yang menyebut PIN. Tebakan asli Router tetap tersimpan
  // di routerAgentType (akurasi "Router saja").
  if (agentType === "transaction" && (readOnlyPinSeen || isReadOnlyTurn(toolTrace))) {
    agentType = "query";
    rec.add({ kind: "route", label: "Tidak ada pencatatan stok, giliran dibaca sebagai pertanyaan stok (Query Agent)", status: "done", assist: "route" });
  }
  // Balasan kosong (Run 19, S-03 single: model diam sesudah diingatkan) tidak
  // boleh sampai ke staf sebagai pesan kosong.
  const rawText = (reply.text || (reply.malformed ? "" : stripThinking(content))).trim();
  const candidate = (readOnlyPin ? dropPinSentences(rawText, pinProductNames) : rawText) || textBeforeNudge;
  // Jawaban panjang, berulang, atau ngomong sendiri dianggap kosong bila hasil alatnya ada (dijawab kode di bawah).
  const modelText = answerFromToolResult && isDegenerateAnswer(candidate) && hasCodeAnswer(toolTrace) ? "" : candidate;
  // Jawaban dari cache offline selalu diberi keterangan oleh kode (model sering lupa).
  const cacheNote = modelText ? cacheNoteFor(toolTrace) : null;
  // Q-13: jawaban tren yang bertentangan dengan hitungan kode diganti kalimat dari kode.
  const trendTrace = [...toolTrace].reverse().find((t) => t.name === "getSalesTrend");
  const trendSummary = trendTrace ? summarizeTrend(trendTrace.result) : null;
  if (modelText && trendSummary && contradictsTrend(modelText, trendSummary)) {
    rec.add(answerStep("code", true));
    const productName = String((trendTrace?.result as { product_name?: unknown })?.product_name ?? "");
    return { agentType, assistantText: trendReply(trendSummary, productName), toolTrace };
  }
  // Q-07: jawaban pembacaan stok yang bertentangan dengan getStock (mis. "kosong di
  // semua lokasi" saat Gudang 2, atau mengaku "sudah dicatat") diganti kalimat dari kode.
  const stockTrace = [...toolTrace].reverse().find((t) => t.name === "getStock");
  const stockSummary = stockTrace && !trendTrace ? summarizeStock(stockTrace.result) : null;
  // Semua kalimat jawaban ternyata permintaan PIN: datanya diambil dari getStock.
  if (!modelText && (readOnlyPin || answerFromToolResult) && stockSummary) {
    rec.add(answerStep("code", true));
    const stockText = stockReply(stockSummary);
    const note = cacheNoteFor(toolTrace);
    return { agentType, assistantText: note ? `${stockText}\n\n${note}` : stockText, toolTrace };
  }
  // Sama untuk tren penjualan: model diam atau rusak sesudah getSalesTrend.
  if (!modelText && answerFromToolResult && trendTrace && trendSummary) {
    rec.add(answerStep("code", true));
    const productName = String((trendTrace.result as { product_name?: unknown })?.product_name ?? "");
    return { agentType, assistantText: trendReply(trendSummary, productName), toolTrace };
  }
  if (modelText && stockSummary && contradictsStock(modelText, stockSummary)) {
    rec.add(answerStep("code", true));
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

/** Hasil alat baca terakhir cukup untuk disusun jadi jawaban oleh kode (stok atau tren). */
export function hasCodeAnswer(toolTrace: AgentTurnResult["toolTrace"]): boolean {
  const last = [...toolTrace].reverse().find((t) => t.name === "getStock" || t.name === "getSalesTrend");
  if (!last) return false;
  return last.name === "getStock" ? summarizeStock(last.result) !== null : summarizeTrend(last.result) !== null;
}
