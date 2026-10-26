import type { ChatCompletion, ChatCompletionRequestNonStreaming, MLCEngineInterface } from "@mlc-ai/web-llm";
import {
  ROUTER_COMPACT_SYSTEM_PROMPT,
  ROUTER_GRAMMAR,
  ROUTER_SYSTEM_PROMPT,
  ROUTER_TINY_SYSTEM_PROMPT,
  buildRouterInput,
  parseRouterReplyOrNull,
} from "@/src/lib/agents/prompts/router";
import { normalizeShorthand } from "@/src/lib/agents/normalize-shorthand";
import { thinkingOptions } from "@/src/lib/agents/model-options";
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

// Dimatikan sesudah satu kegagalan supaya tiap giliran tidak mencoba grammar yang tidak jalan.
let grammarUnavailable = false;

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
  const useGrammar = profile.routerGrammar && !grammarUnavailable;
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
    grammarUnavailable = true;
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
