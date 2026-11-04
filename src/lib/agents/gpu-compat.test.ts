import { describe, it, expect } from "vitest";
import { checkGpuCompatibility, largestFittingTier, modelFitsGpu } from "@/src/lib/agents/gpu-compat";
import { MODEL_OPTIONS, MODEL_TIERS } from "@/src/lib/agents/model-options";

const MIB = 2 ** 20;

describe("gpu-compat", () => {
  it("setiap model punya ukuran buffer terukur", () => {
    for (const m of MODEL_OPTIONS) expect(m.bufferBytes).toBeGreaterThan(0);
  });

  it("batas tidak diketahui tidak memblokir apa pun", () => {
    expect(modelFitsGpu("Qwen2.5-3B-Instruct-q4f16_1-MLC", null)).toBe(true);
    expect(checkGpuCompatibility("Qwen2.5-3B-Instruct-q4f16_1-MLC", null).changed).toBe(false);
  });

  it("GPU 128 MB: Saga dan Ballad tidak muat, Tanka muat", () => {
    const limit = 128 * MIB;
    expect(largestFittingTier(limit, false)?.id).toBe("tanka");
    const result = checkGpuCompatibility("Qwen2.5-3B-Instruct-q4f16_1-MLC", limit);
    expect(result).toMatchObject({ changed: true, modelId: "Qwen3.5-0.8B-q4f16_1-MLC" });
    expect(result.message).toContain("Dialihkan ke Tanka");
  });

  it("GPU 256 MB: semua tingkat muat, tidak ada yang diganti", () => {
    for (const t of MODEL_TIERS) expect(checkGpuCompatibility(t.f16, 256 * MIB).changed).toBe(false);
  });

  it("varian f32 tetap f32 setelah dialihkan", () => {
    expect(checkGpuCompatibility("Qwen2.5-3B-Instruct-q4f32_1-MLC", 128 * MIB).modelId).toBe("Qwen3.5-0.8B-q4f32_1-MLC");
  });

  it("GPU lebih kecil dari semua tingkat: tidak ada model, pesan jelas", () => {
    const result = checkGpuCompatibility("Qwen3-1.7B-q4f16_1-MLC", 64 * MIB);
    expect(result).toMatchObject({ modelId: null, changed: true });
    expect(result.message).toContain("Tidak ada model");
  });
});
