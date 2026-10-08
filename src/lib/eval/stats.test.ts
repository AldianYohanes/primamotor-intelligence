import { describe, it, expect } from "vitest";
import { mcnemarExact, wilcoxonSignedRank } from "@/src/lib/eval/stats";

describe("mcnemarExact", () => {
  it("menghitung pasangan diskordan dan p binomial dua sisi", () => {
    // b = 3, c = 1 → p = 2 × P(X ≤ 1 | n = 4) = 2 × 5/16 = 0,625
    const pairs = [
      ...Array(3).fill({ a: true, b: false }),
      { a: false, b: true },
      ...Array(10).fill({ a: true, b: true }),
    ];
    const r = mcnemarExact(pairs);
    expect(r).toMatchObject({ b: 3, c: 1, n: 4 });
    expect(r.p).toBeCloseTo(0.625, 10);
  });

  it("p = 1 bila tidak ada pasangan diskordan", () => {
    expect(mcnemarExact([{ a: true, b: true }]).p).toBe(1);
  });

  it("signifikan untuk perbedaan satu arah yang besar", () => {
    const r = mcnemarExact(Array(10).fill({ a: true, b: false }));
    expect(r.p).toBeCloseTo(2 / 1024, 10);
  });
});

describe("wilcoxonSignedRank", () => {
  it("cocok dengan nilai buku teks untuk sampel kecil tanpa peringkat bersama", () => {
    // Selisih 1..5 semuanya positif: W− = 0, p dua sisi = 2/32 = 0,0625
    const r = wilcoxonSignedRank([1, 2, 3, 4, 5].map((x) => ({ a: x, b: 0 })));
    expect(r.wPlus).toBe(15);
    expect(r.wMinus).toBe(0);
    expect(r.p).toBeCloseTo(0.0625, 10);
  });

  it("membuang selisih nol dan merata-rata peringkat bersama", () => {
    const r = wilcoxonSignedRank([
      { a: 5, b: 5 }, // nol, dibuang
      { a: 3, b: 1 }, // +2
      { a: 1, b: 3 }, // −2
      { a: 10, b: 4 }, // +6
    ]);
    expect(r.n).toBe(3);
    expect(r.wPlus).toBe(4.5); // peringkat 1,5 + 3
    expect(r.wMinus).toBe(1.5);
    expect(r.medianDiff).toBe(1); // median dari [−2, 0, 2, 6]
  });

  it("p = 1 bila semua selisih nol", () => {
    expect(wilcoxonSignedRank([{ a: 1, b: 1 }]).p).toBe(1);
  });
});
