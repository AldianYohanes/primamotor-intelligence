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
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5 3B", vramMB: 2505 },
  { id: "Qwen2.5-3B-Instruct-q4f32_1-MLC", label: "Qwen2.5 3B · tanpa f16", vramMB: 2894 },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B", vramMB: 2264 },
  { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", label: "Llama 3.2 3B · tanpa f16", vramMB: 2952 },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B · ringan", vramMB: 1630 },
  { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", label: "Qwen2.5 1.5B · ringan, tanpa f16", vramMB: 1889 },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B · ringan", vramMB: 879 },
  { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", label: "Llama 3.2 1B · ringan, tanpa f16", vramMB: 1129 },
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "Qwen3 1.7B · ringan", vramMB: 2037 },
  { id: "Qwen3-1.7B-q4f32_1-MLC", label: "Qwen3 1.7B · ringan, tanpa f16", vramMB: 2635 },
  { id: "Qwen3.5-0.8B-q4f16_1-MLC", label: "Qwen3.5 0.8B · sangat ringan", vramMB: 1629 },
  { id: "Qwen3.5-0.8B-q4f32_1-MLC", label: "Qwen3.5 0.8B · sangat ringan, tanpa f16", vramMB: 1894 },
  { id: "gemma3-1b-it-q4f16_1-MLC", label: "Gemma 3 1B · sangat ringan", vramMB: 711 },
  { id: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC", label: "Hermes 2 Pro Mistral 7B", vramMB: 4033 },
  { id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC", label: "Hermes 3 Llama 3.1 8B", vramMB: 4876 },
] as const;

/**
 * Tiga tingkat untuk pengguna, supaya staf memilih "Saga / Ballad / Tanka" dan bukan nama model.
 * Urutan teliti ke cepat berdasarkan ukuran model; belum dibuktikan satu per satu di /eval.
 * Tiap tingkat punya varian f16 (hemat memori) dan f32 (untuk GPU yang menolak f16); staf tidak diminta memilih.
 */
export const MODEL_TIERS = [
  { id: "saga", name: "Saga", note: "paling teliti, agak lambat", f16: "Qwen2.5-3B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-3B-Instruct-q4f32_1-MLC" },
  { id: "ballad", name: "Ballad", note: "seimbang", f16: "Qwen3-1.7B-q4f16_1-MLC", f32: "Qwen3-1.7B-q4f32_1-MLC" },
  { id: "tanka", name: "Tanka", note: "paling cepat, lebih sering keliru", f16: "Qwen3.5-0.8B-q4f16_1-MLC", f32: "Qwen3.5-0.8B-q4f32_1-MLC" },
] as const;

export type ModelTier = (typeof MODEL_TIERS)[number];

/** Tingkat awal di perangkat baru. */
export const DEFAULT_TIER: ModelTier = MODEL_TIERS[1];

export function tierOfModel(modelId: string): ModelTier | undefined {
  return MODEL_TIERS.find((t) => t.f16 === modelId || t.f32 === modelId);
}

export function isF32Model(modelId: string): boolean {
  return modelId.includes("q4f32");
}

/** Model tingkat ini; f32 bila GPU perangkat tidak bisa memakai f16. */
export function tierModelId(tier: ModelTier, f32: boolean): string {
  return f32 ? tier.f32 : tier.f16;
}

/** Padanan f32 dari model f16; null bila bukan model q4f16. */
export function f32Variant(modelId: string): string | null {
  return modelId.includes("q4f16_1") ? modelId.replace("q4f16_1", "q4f32_1") : null;
}

/** Nama untuk pengguna: nama tingkat bila model termasuk tiga tingkat, selain itu label teknis. */
export function userModelLabel(modelId: string): string {
  return tierOfModel(modelId)?.name ?? MODEL_OPTIONS.find((m) => m.id === modelId)?.label ?? modelId;
}

/** Model di luar tiga tingkat (Llama, Gemma, Hermes, dst.); tampil di bagian "Lainnya". */
export const OTHER_MODEL_OPTIONS = MODEL_OPTIONS.filter((m) => !tierOfModel(m.id));

/**
 * Opsi WebLLM untuk mematikan mode berpikir. Hanya model Qwen3 yang mengenalnya
 * (di model lain WebLLM tidak memeriksa, tapi menyisipkan tag <think> kosong).
 * Teks <think> yang tetap muncul dibuang oleh stripThinking (tool-protocol.ts).
 */
export function thinkingOptions(modelId: string): { extra_body?: { enable_thinking: false } } {
  return /qwen3/i.test(modelId) ? { extra_body: { enable_thinking: false } } : {};
}
