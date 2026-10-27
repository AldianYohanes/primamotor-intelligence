import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { isGrammarUnavailable, markGrammarUnavailable } from "@/src/lib/agents/grammar-status";
import { TOOL_STOP_SEQUENCES, visibleStreamText } from "@/src/lib/agents/tool-protocol";
import { thinkingOptions } from "@/src/lib/agents/model-options";
import { getActiveModelId } from "@/src/lib/agents/webllm-engine";
import { TurnStoppedError, type ChatMessage } from "@/src/lib/agents/turn/types";
import type { WebLlmUsage } from "@/src/lib/agents/inference-stats";

/** Menghentikan generasi model begitu `signal` dibatalkan; kembalikan fungsi pembersih. */
export function interruptOnAbort(engine: MLCEngineInterface, signal?: AbortSignal): () => void {
  if (!signal) return () => {};
  const onAbort = () => {
    Promise.resolve(engine.interruptGenerate()).catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
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
}
type StreamChunkUsage = WebLlmUsage;
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
export async function streamChatCompletion(
  engine: MLCEngineInterface,
  messages: ChatMessage[],
  onToken?: (partialText: string) => void,
  signal?: AbortSignal,
  /** Dipanggil tiap chunk teks, untuk statistik inferensi (inference-stats.ts). */
  onChunk?: () => void,
  /** Batas token keluaran panggilan ini; kosong = tanpa batas. */
  maxTokens?: number,
  /** Grammar EBNF yang memaksa bentuk keluaran (tool-grammar.ts); dilepas bila build WebLLM menolaknya. */
  grammar?: string,
): Promise<{
  content: string;
  usage: StreamChunkUsage | null;
}> {
  if (signal?.aborted) throw new TurnStoppedError();
  const stopListening = interruptOnAbort(engine, signal);
  try {
    return await consumeStream(engine, messages, onToken, signal, onChunk, maxTokens, grammar);
  } finally {
    stopListening();
  }
}

async function consumeStream(
  engine: MLCEngineInterface,
  messages: ChatMessage[],
  onToken?: (partialText: string) => void,
  signal?: AbortSignal,
  onChunk?: () => void,
  maxTokens?: number,
  grammar?: string,
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
  const request = {
    messages,
    temperature: 0.2,
    stop: TOOL_STOP_SEQUENCES,
    ...(maxTokens && { max_tokens: maxTokens }),
    stream: true,
    stream_options: { include_usage: true },
    ...thinkingOptions(getActiveModelId()),
  };
  const create = (extra: object) => engine.chat.completions.create({ ...request, ...extra } as unknown as CreateParams);
  let stream: AsyncIterable<StreamChunk>;
  if (grammar && !isGrammarUnavailable()) {
    try {
      stream = (await create({ response_format: { type: "grammar", grammar } })) as AsyncIterable<StreamChunk>;
    } catch (err) {
      if (signal?.aborted) throw err;
      // Build WebLLM menolak grammar ini: balasan jalan seperti model lain dan grammar tidak dicoba lagi.
      markGrammarUnavailable("panggilan alat", err);
      stream = (await create({})) as AsyncIterable<StreamChunk>;
    }
  } else {
    stream = (await create({})) as AsyncIterable<StreamChunk>;
  }

  let content = "";
  let usage: StreamChunkUsage | null = null;

  for await (const chunk of stream) {
    if (signal?.aborted) throw new TurnStoppedError(visibleStreamText(content));
    if (chunk.usage) usage = chunk.usage;

    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      content += delta.content;
      onChunk?.();
      onToken?.(visibleStreamText(content));
    }
  }

  if (signal?.aborted) throw new TurnStoppedError(visibleStreamText(content));

  // Teks yang disimpan web-llm (stop string dipotong). Streaming tidak menahan
  // potongan stop string yang terdiri dari beberapa token, jadi `content` bisa
  // berbeda; riwayat harus identik dengan versi ini agar KV cache dipakai ulang.
  const stored = await engine.getMessage().catch(() => null);
  return { content: stored || content, usage };
}
