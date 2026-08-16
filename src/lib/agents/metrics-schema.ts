import { z } from "zod";

/**
 * Payload yang dikirim orchestrator.ts (client) ke /api/agent/metrics setiap
 * runAgentTurn selesai — satu baris per giliran chat (bukan per pemanggilan LLM
 * individual), cukup granular untuk evaluasi performa LLM on-device di BAB 4
 * tanpa membanjiri tabel dengan insert per iterasi tool-loop.
 *
 * business_id SENGAJA TIDAK ada di sini — diambil dari staffRow hasil sesi
 * server, bukan dipercaya dari client (konsisten dengan pola update-stock,
 * transfer-stock, dst).
 */
export const agentExecutionMetricSchema = z.object({
  conversation_id: z.string().uuid(),
  agent_type: z.enum(["query", "transaction", "off_topic"]),
  model_name: z.string().min(1).nullable(),
  prompt_tokens: z.number().int().nonnegative().nullable(),
  completion_tokens: z.number().int().nonnegative().nullable(),
  context_length_at_call: z.number().int().nonnegative().nullable(),
  latency_ms: z.number().int().nonnegative(),
  succeeded: z.boolean(),
  error_message: z.string().nullable(),
});

export type AgentExecutionMetricPayload = z.infer<
  typeof agentExecutionMetricSchema
>;
