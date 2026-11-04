import type { ChatCompletion, ChatCompletionRequestNonStreaming, MLCEngineInterface } from "@mlc-ai/web-llm";
import {
  ROUTER_COMPACT_SYSTEM_PROMPT,
  ROUTER_GRAMMAR,
  ROUTER_RECORD_PROMPT,
  ROUTER_TOPIC_PROMPT,
  ROUTER_YESNO_GRAMMAR,
  parseYesNo,
  ROUTER_SYSTEM_PROMPT,
  ROUTER_TINY_SYSTEM_PROMPT,
  buildRouterInput,
  parseRouterReplyOrNull,
} from "@/src/lib/agents/prompts/router";
import { normalizeShorthand } from "@/src/lib/agents/normalize-shorthand";
import { thinkingOptions } from "@/src/lib/agents/model-options";
import { isGrammarUnavailable, markGrammarUnavailable } from "@/src/lib/agents/grammar-status";
import { getModelProfile } from "@/src/lib/agents/model-profile";
import { guardRoute } from "@/src/lib/agents/route-guard";
import { getActiveModelId } from "@/src/lib/agents/webllm-engine";
import { routerContext } from "@/src/lib/agents/router-context";
import { CODE_REPLIES } from "@/src/lib/agents/turn/replies";
import { interruptOnAbort } from "@/src/lib/agents/turn/stream";
import { TurnStoppedError, type ChatMessage } from "@/src/lib/agents/turn/types";
import type { WebLlmUsage } from "@/src/lib/agents/inference-stats";

export type NonStreamUsage = WebLlmUsage;

const ROUTER_PROMPTS = {
  default: ROUTER_SYSTEM_PROMPT,
  compact: ROUTER_COMPACT_SYSTEM_PROMPT,
  tiny: ROUTER_TINY_SYSTEM_PROMPT,
} as const;


/** Satu pertanyaan ya/tidak ke Router; grammar dilepas bila build WebLLM menolaknya (sama seperti label). */
async function askYesNo(
  engine: MLCEngineInterface,
  system: string,
  input: string,
  modelId: string,
  signal?: AbortSignal,
): Promise<{ text: string; usage: NonStreamUsage | null }> {
  const request: ChatCompletionRequestNonStreaming = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
    temperature: 0,
    ...thinkingOptions(modelId),
  };
  const useGrammar = !isGrammarUnavailable();
  const stopListening = interruptOnAbort(engine, signal);
  let completion: ChatCompletion;
  try {
    completion = await engine.chat.completions.create(
      useGrammar ? { ...request, response_format: { type: "grammar", grammar: ROUTER_YESNO_GRAMMAR }, max_tokens: 4 } : { ...request, max_tokens: 8 },
    );
  } catch (err) {
    if (signal?.aborted) throw new TurnStoppedError();
    if (!useGrammar) throw err;
    markGrammarUnavailable("Router ya/tidak", err);
    completion = await engine.chat.completions.create({ ...request, max_tokens: 8 });
  } finally {
    stopListening();
  }
  if (signal?.aborted) throw new TurnStoppedError();
  return {
    text: completion.choices[0]?.message?.content ?? "",
    usage: (completion as unknown as { usage?: NonStreamUsage }).usage ?? null,
  };
}

function sumUsage(a: NonStreamUsage | null, b: NonStreamUsage | null): NonStreamUsage | null {
  if (!a || !b) return a ?? b;
  return {
    ...b,
    prompt_tokens: (a.prompt_tokens ?? 0) + (b.prompt_tokens ?? 0),
    completion_tokens: (a.completion_tokens ?? 0) + (b.completion_tokens ?? 0),
  };
}

/** Router dua pertanyaan: "urusan stok toko?" lalu, bila ya, "minta mencatat perubahan?". */
async function routeBinary(
  engine: MLCEngineInterface,
  userMessage: string,
  lastAssistant: string | undefined,
  modelId: string,
  recovery: boolean,
  signal?: AbortSignal,
) {
  const input = buildRouterInput(normalizeShorthand(userMessage), lastAssistant);
  const topic = await askYesNo(engine, ROUTER_TOPIC_PROMPT, input, modelId, signal);
  const onTopic = parseYesNo(topic.text);
  if (onTopic === false) return { agentType: "off_topic" as const, text: `topik: ${topic.text}`, usage: topic.usage };
  if (onTopic === null) {
    const agentType = recovery ? guardRoute("off_topic", userMessage).agentType : "off_topic";
    return { agentType, text: `topik: ${topic.text}`, usage: topic.usage };
  }
  const record = await askYesNo(engine, ROUTER_RECORD_PROMPT, input, modelId, signal);
  const asksRecord = parseYesNo(record.text);
  // Jawaban kedua tak terbaca: dianggap bertanya (Query Agent hanya membaca, jadi tidak berisiko mengubah stok).
  return {
    agentType: asksRecord === true ? ("transaction" as const) : ("query" as const),
    text: `topik: ${topic.text.trim()}; mencatat: ${record.text.trim()}`,
    usage: sumUsage(topic.usage, record.usage),
  };
}

export async function routeMessage(
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
  const modelId = getActiveModelId();
  const profile = getModelProfile(modelId);
  if (profile.routerMode === "binary") return routeBinary(engine, userMessage, lastAssistant, modelId, profile.routerRecovery, signal);
  const useGrammar = profile.routerGrammar && !isGrammarUnavailable();
  const request: ChatCompletionRequestNonStreaming = {
    messages: [
      { role: "system", content: ROUTER_PROMPTS[profile.routerPrompt] },
      // Singkatan diluruskan hanya untuk Router; agent dan riwayat tetap teks asli.
      { role: "user", content: buildRouterInput(normalizeShorthand(userMessage), lastAssistant) },
    ],
    temperature: 0,
    ...thinkingOptions(modelId),
  };
  const stopListening = interruptOnAbort(engine, signal);
  let completion: ChatCompletion;
  try {
    completion = await engine.chat.completions.create(
      useGrammar ? { ...request, response_format: { type: "grammar", grammar: ROUTER_GRAMMAR }, max_tokens: 8 } : request,
    );
  } catch (err) {
    if (signal?.aborted) throw new TurnStoppedError();
    if (!useGrammar) throw err;
    // Build WebLLM yang menolak grammar: Router jalan seperti model lain, dan grammar tidak dicoba lagi.
    markGrammarUnavailable("Router label", err);
    completion = await engine.chat.completions.create(request);
  } finally {
    stopListening();
  }
  if (signal?.aborted) throw new TurnStoppedError();
  const text = completion.choices[0]?.message?.content ?? "";
  const usage = (completion as unknown as { usage?: NonStreamUsage }).usage ?? null;
  const parsed = parseRouterReplyOrNull(text);
  // Tanpa label: model lain tetap OFF_TOPIC (perilaku lama); profil kecil lewat pengaman kode.
  const agentType = parsed ?? (profile.routerRecovery ? guardRoute("off_topic", userMessage).agentType : "off_topic");
  return { agentType, text, usage };
}
