import { describe, it, expect } from "vitest";
import {
  contradictsTrend,
  summarizeTrend,
  trendFactsText,
  trendReply,
} from "@/src/lib/agents/trend-summary";

function result(quantities: number[], start = "2026-08-01") {
  const [y, m] = start.split("-").map(Number);
  return {
    product_name: "Wiper Bosch",
    trend: quantities.map((q, i) => {
      const d = new Date(Date.UTC(y, m - 1 + i, 1));
      return { period: d.toISOString().slice(0, 10), total_keluar: q };
    }),
  };
}

describe("summarizeTrend", () => {
  it("membaca penurunan 11 → 6 → 4 sebagai turun, puncak di bulan pertama", () => {
    const s = summarizeTrend(result([11, 6, 4]));
    expect(s?.direction).toBe("turun");
    expect(s?.total).toBe(21);
    expect(s?.peak).toEqual({ label: "Agu 2026", quantity: 11 });
  });

  it("membaca kenaikan sebagai naik, puncak di bulan terakhir", () => {
    const s = summarizeTrend(result([2, 5, 9]));
    expect(s?.direction).toBe("naik");
    expect(s?.peak?.label).toBe("Okt 2026");
  });

  it("selisih kecil dianggap stabil dan tidak menyebut puncak", () => {
    const s = summarizeTrend(result([10, 10, 10]));
    expect(s?.direction).toBe("stabil");
    expect(s?.peak).toBeNull();
  });

  it("urutan data diacak tetap dibaca menurut bulan", () => {
    const r = result([11, 6, 4]);
    r.trend.reverse();
    expect(summarizeTrend(r)?.direction).toBe("turun");
  });

  it("tanpa penjualan sama sekali", () => {
    const s = summarizeTrend(result([0, 0, 0]));
    expect(s?.direction).toBe("tidak_ada_penjualan");
    expect(s?.peak).toBeNull();
  });

  it("satu bulan data tidak cukup untuk arah", () => {
    expect(summarizeTrend(result([7]))?.direction).toBe("tidak_cukup_data");
  });

  it("null untuk hasil tanpa data tren atau berisi error", () => {
    expect(summarizeTrend({ error: "x" })).toBeNull();
    expect(summarizeTrend({ trend: [] })).toBeNull();
    expect(summarizeTrend(null)).toBeNull();
  });
});

describe("trendFactsText & trendReply", () => {
  const s = summarizeTrend(result([11, 6, 4]))!;

  it("fakta untuk model menyebut arah, puncak, dan per bulan", () => {
    const text = trendFactsText(s);
    expect(text).toContain("turun");
    expect(text).toContain("Agu 2026");
    expect(text).toContain("11");
    expect(text).toContain("4");
  });

  it("kalimat jawaban dari kode memuat nama barang, arah, dan puncak", () => {
    const text = trendReply(s, "Wiper Bosch");
    expect(text).toContain("Wiper Bosch");
    expect(text).toContain("turun");
    expect(text).toContain("Agu 2026");
    expect(text).not.toMatch(/naik|meningkat/i);
  });
});

describe("contradictsTrend", () => {
  const turun = summarizeTrend(result([11, 6, 4]))!;
  const naik = summarizeTrend(result([2, 5, 9]))!;

  it("menangkap jawaban 'naik' padahal data turun", () => {
    expect(contradictsTrend("Penjualan wiper bosch naik dalam 3 bulan terakhir.", turun)).toBe(true);
  });

  it("menangkap 'turun' padahal data naik", () => {
    expect(contradictsTrend("Penjualannya menurun terus.", naik)).toBe(true);
  });

  it("menangkap bulan tertinggi yang salah", () => {
    expect(contradictsTrend("Paling laku di bulan Okt 2026, total 21.", turun)).toBe(true);
  });

  it("jawaban yang cocok dengan data lolos", () => {
    expect(contradictsTrend("Penjualan turun, paling banyak di Agu 2026 (11).", turun)).toBe(false);
  });

  it("jawaban tanpa klaim arah lolos", () => {
    expect(contradictsTrend("Totalnya 21 buah dalam 3 bulan.", turun)).toBe(false);
  });
});
