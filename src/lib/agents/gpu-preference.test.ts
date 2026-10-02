import { describe, it, expect } from "vitest";
import { recommendGpu, type GpuAdapterSummary } from "@/src/lib/agents/gpu-preference";

const gpu = (description: string, shaderF16: boolean, vendor = "x"): GpuAdapterSummary => ({
  vendor,
  description,
  maxStorageBufferBindingSizeMB: 2048,
  maxBufferSizeMB: 2048,
  shaderF16,
});

const mx150 = gpu("NVIDIA GeForce MX150", false, "nvidia");
const uhd620 = gpu("Intel(R) UHD Graphics 620", true, "intel");

describe("recommendGpu", () => {
  it("mengutamakan GPU dengan shader-f16 walau hemat daya (laptop UHD 620 + MX150)", () => {
    const r = recommendGpu([
      { preference: "high-performance", adapter: mx150 },
      { preference: "low-power", adapter: uhd620 },
    ]);
    expect(r).toMatchObject({ kind: "choose", preference: "low-power" });
  });

  it("memilih performa tinggi bila keduanya setara", () => {
    const r = recommendGpu([
      { preference: "high-performance", adapter: gpu("NVIDIA RTX 3050", true, "nvidia") },
      { preference: "low-power", adapter: uhd620 },
    ]);
    expect(r).toMatchObject({ kind: "choose", preference: "high-performance" });
  });

  it("mengenali browser yang memberi GPU sama untuk kedua pilihan", () => {
    const r = recommendGpu([
      { preference: "high-performance", adapter: mx150 },
      { preference: "low-power", adapter: { ...mx150 } },
    ]);
    expect(r).toEqual({ kind: "browser_ignores", adapter: mx150 });
  });

  it("menangani satu atau nol adapter", () => {
    expect(recommendGpu([{ preference: "high-performance", adapter: uhd620 }, { preference: "low-power", adapter: null }])).toEqual({
      kind: "single",
      adapter: uhd620,
    });
    expect(recommendGpu([])).toEqual({ kind: "none" });
  });
});
