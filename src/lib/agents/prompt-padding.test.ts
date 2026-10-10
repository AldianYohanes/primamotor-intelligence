import { describe, it, expect, afterEach } from "vitest";
import { buildNeutralPadding, isPromptPaddingOn, PADDING_CHAR_SCALE, paddingLength, setPromptPadding } from "./prompt-padding";

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

  it("mengecilkan padding sesuai kalibrasi token per karakter (0,48) dan tidak pernah negatif", () => {
    expect(PADDING_CHAR_SCALE).toBeCloseTo(0.48);
    expect(paddingLength(1000)).toBe(480);
    expect(paddingLength(0)).toBe(0);
    expect(paddingLength(-300)).toBe(0);
    // Kalibrasi 10 Okt 2026: selisih 1.235 token pada skala penuh menjadi sekitar 593 token.
    expect(Math.round(1235 * PADDING_CHAR_SCALE)).toBeGreaterThanOrEqual(590);
    expect(Math.round(1235 * PADDING_CHAR_SCALE)).toBeLessThanOrEqual(596);
  });

  it("tidak memuat nama alat atau kata konfirmasi yang bisa memengaruhi model", () => {
    const text = buildNeutralPadding(1000).toLowerCase();
    for (const word of ["getstock", "updatestock", "transferstock", "pin"]) {
      expect(text.includes(word)).toBe(false);
    }
  });
});
