import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { ROUTER_SYSTEM_PROMPT, buildRouterInput, parseRouterReply } from "@/src/lib/agents/prompts/router";
import { normalizeShorthand } from "@/src/lib/agents/normalize-shorthand";
import { thinkingOptions } from "@/src/lib/agents/model-options";
import { getActiveModelId } from "@/src/lib/agents/webllm-engine";
import { routerContext } from "@/src/lib/agents/router-context";
import { CODE_REPLIES } from "@/src/lib/agents/turn/replies";
import { interruptOnAbort } from "@/src/lib/agents/turn/stream";
import { TurnStoppedError, type ChatMessage } from "@/src/lib/agents/turn/types";

export interface NonStreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
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
      ...thinkingOptions(getActiveModelId()),
    });
  } finally {
    stopListening();
  }
  if (signal?.aborted) throw new TurnStoppedError();
  const text = completion.choices[0]?.message?.content ?? "";
  const usage = (completion as unknown as { usage?: NonStreamUsage }).usage ?? null;
  return { agentType: parseRouterReply(text), text, usage };
}
