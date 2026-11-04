import { describe, expect, it } from "vitest";
import { rateLimited } from "./memory-rate-limit";

describe("rateLimited", () => {
  it("menolak setelah melewati batas dalam jendela, lalu terbuka lagi", () => {
    const k = "uji-1";
    expect(rateLimited(k, 2, 1000, 0)).toBe(false);
    expect(rateLimited(k, 2, 1000, 10)).toBe(false);
    expect(rateLimited(k, 2, 1000, 20)).toBe(true);
    expect(rateLimited(k, 2, 1000, 1500)).toBe(false);
  });

  it("kunci berbeda punya jatah sendiri", () => {
    expect(rateLimited("a", 1, 1000, 0)).toBe(false);
    expect(rateLimited("b", 1, 1000, 0)).toBe(false);
    expect(rateLimited("a", 1, 1000, 1)).toBe(true);
  });
});
