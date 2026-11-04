import { describe, it, expect } from "vitest";
import {
  DEFAULT_TIER,
  MODEL_OPTIONS,
  MODEL_TIERS,
  OTHER_MODEL_OPTIONS,
  f32Variant,
  tierModelId,
  tierOfModel,
  userModelLabel,
} from "@/src/lib/agents/model-options";

describe("tingkat model", () => {
  it("model tiap tingkat ada di daftar model", () => {
    const ids = new Set(MODEL_OPTIONS.map((m) => m.id));
    for (const t of MODEL_TIERS) {
      expect(ids.has(t.f16)).toBe(true);
      expect(ids.has(t.f32)).toBe(true);
      expect(f32Variant(t.f16)).toBe(t.f32);
    }
  });

  it("varian f16 dan f32 menunjuk tingkat yang sama", () => {
    for (const t of MODEL_TIERS) {
      expect(tierOfModel(t.f16)).toBe(t);
      expect(tierOfModel(tierModelId(t, true))).toBe(t);
    }
    expect(DEFAULT_TIER.id).toBe("ballad");
  });

  it("model di luar tiga tingkat masuk Lainnya dan memakai label teknis", () => {
    expect(OTHER_MODEL_OPTIONS.length).toBeGreaterThan(0);
    expect(OTHER_MODEL_OPTIONS.some((m) => tierOfModel(m.id))).toBe(false);
    expect(userModelLabel(MODEL_TIERS[0].f16)).toBe("Saga");
    expect(userModelLabel(OTHER_MODEL_OPTIONS[0].id)).toBe(OTHER_MODEL_OPTIONS[0].label);
  });

  it("f32Variant null untuk model non-q4f16", () => {
    expect(f32Variant("Qwen3-1.7B-q4f32_1-MLC")).toBeNull();
  });
});
