import { describe, it, expect, afterEach } from "vitest";
import { buildNeutralPadding, isPromptPaddingOn, setPromptPadding } from "./prompt-padding";

describe("prompt-padding (ablasi eval)", () => {
  afterEach(() => setPromptPadding(false));

  it("mati secara bawaan dan bisa dinyalakan", () => {
    expect(isPromptPaddingOn()).toBe(false);
    setPromptPadding(true);
    expect(isPromptPaddingOn()).toBe(true);
  });

  it("menghasilkan teks netral dengan panjang tepat", () => {
    for (const n of [1, 50, 187, 2500]) expect(buildNeutralPadding(n)).toHaveLength(n);
    expect(buildNeutralPadding(0)).toBe("");
    expect(buildNeutralPadding(-5)).toBe("");
  });

  it("tidak memuat nama alat atau kata konfirmasi yang bisa memengaruhi model", () => {
    const text = buildNeutralPadding(1000).toLowerCase();
    for (const word of ["getstock", "updatestock", "transferstock", "pin"]) {
      expect(text.includes(word)).toBe(false);
    }
  });
});
