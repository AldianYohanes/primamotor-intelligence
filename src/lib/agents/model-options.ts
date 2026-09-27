/**
 * Dipisah dari webllm-engine.ts supaya UI bisa menampilkan pilihan model
 * tanpa ikut memuat seluruh library @mlc-ai/web-llm.
 *
 * Tool calling memakai protokol prompt sendiri (tool-protocol.ts), jadi model
 * apa pun dari prebuiltAppConfig WebLLM bisa dipakai, tidak terbatas Hermes.
 */
export const MODEL_ID = "Qwen2.5-3B-Instruct-q4f16_1-MLC";

// Varian q4f32 tidak memakai shader f16; dipakai kalau GPU/browser menolak
// "enable f16" walau adapter melaporkan shader-f16 (terjadi di Adreno X1 + Edge).
export const MODEL_OPTIONS = [
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5 3B (kandidat proposal)", vramMB: 2505 },
  { id: "Qwen2.5-3B-Instruct-q4f32_1-MLC", label: "Qwen2.5 3B f32 (kandidat proposal, tanpa f16)", vramMB: 2894 },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B (kandidat proposal)", vramMB: 2264 },
  { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", label: "Llama 3.2 3B f32 (kandidat proposal, tanpa f16)", vramMB: 2952 },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B (ringan, HP)", vramMB: 1630 },
  { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", label: "Qwen2.5 1.5B f32 (ringan, tanpa f16)", vramMB: 1889 },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B (ringan, HP)", vramMB: 879 },
  { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", label: "Llama 3.2 1B f32 (ringan, tanpa f16)", vramMB: 1129 },
  { id: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC", label: "Hermes 2 Pro Mistral 7B", vramMB: 4033 },
  { id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC", label: "Hermes 3 Llama 3.1 8B", vramMB: 4876 },
] as const;
