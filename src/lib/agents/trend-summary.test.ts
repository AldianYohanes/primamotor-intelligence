import { describe, it, expect } from "vitest";
import {
  contradictsTrend,
  summarizeTrend,
  trendFactsText,
  trendReply,
} from "@/src/lib/agents/trend-summary";

// Tetap di 2027 supaya tidak ada titik data yang jatuh di bulan berjalan, kecuali tes khususnya.
const NOW = new Date("2027-01-15T00:00:00Z");
const summarize = (r: unknown, now: Date = NOW) => summarizeTrend(r, now);

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
    const s = summarize(result([11, 6, 4]));
    expect(s?.direction).toBe("turun");
    expect(s?.total).toBe(21);
    expect(s?.peak).toEqual({ label: "Agu 2026", quantity: 11 });
  });

  it("membaca kenaikan sebagai naik, puncak di bulan terakhir", () => {
    const s = summarize(result([2, 5, 9]));
    expect(s?.direction).toBe("naik");
    expect(s?.peak?.label).toBe("Okt 2026");
  });

  it("selisih kecil dianggap stabil dan tidak menyebut puncak", () => {
    const s = summarize(result([10, 10, 10]));
    expect(s?.direction).toBe("stabil");
    expect(s?.peak).toBeNull();
  });

  it("data naik-turun (10, 2, 10) bukan stabil", () => {
    const s = summarize(result([10, 2, 10]));
    expect(s?.direction).toBe("naik_turun");
    expect(s?.peak).toBeNull();
    expect(trendReply(s!, "Wiper Bosch")).toMatch(/naik-turun/);
  });

  it("bulan berjalan (baru sebagian) tidak ikut menghitung arah: stabil 10 per bulan, 5 di tengah bulan", () => {
    // 2026-08, 2026-09 penuh; 2026-10 bulan berjalan di 15 Okt.
    const s = summarize(result([10, 10, 5]), new Date("2026-10-15T00:00:00Z"));
    expect(s?.direction).toBe("stabil");
    expect(s?.points[2]).toEqual({ label: "Okt 2026", quantity: 5, partial: true });
    expect(s?.total).toBe(25);
    expect(trendFactsText(s!)).toContain("bulan berjalan");
    expect(trendReply(s!, "Wiper Bosch")).toContain("Okt 2026: 5 (bulan berjalan, belum penuh)");
    // Bulan lain di masa depan: titik yang sama dianggap bulan penuh dan arahnya turun.
    expect(summarize(result([10, 10, 5]))?.direction).toBe("turun");
  });

  it("bulan tertinggi hanya dari bulan penuh", () => {
    const s = summarize(result([4, 6, 30]), new Date("2026-10-15T00:00:00Z"));
    expect(s?.direction).toBe("naik");
    expect(s?.peak).toEqual({ label: "Sep 2026", quantity: 6 });
  });

  it("satu bulan penuh ditambah bulan berjalan belum cukup untuk arah", () => {
    const s = summarize(result([8, 3], "2026-09-01"), new Date("2026-10-15T00:00:00Z"));
    expect(s?.direction).toBe("tidak_cukup_data");
    expect(s?.peak).toBeNull();
  });

  it("urutan data diacak tetap dibaca menurut bulan", () => {
    const r = result([11, 6, 4]);
    r.trend.reverse();
    expect(summarize(r)?.direction).toBe("turun");
  });

  it("tanpa penjualan sama sekali", () => {
    const s = summarize(result([0, 0, 0]));
    expect(s?.direction).toBe("tidak_ada_penjualan");
    expect(s?.peak).toBeNull();
  });

  it("satu bulan data tidak cukup untuk arah", () => {
    expect(summarize(result([7]))?.direction).toBe("tidak_cukup_data");
  });

  it("null untuk hasil tanpa data tren atau berisi error", () => {
    expect(summarize({ error: "x" })).toBeNull();
    expect(summarize({ trend: [] })).toBeNull();
    expect(summarize(null)).toBeNull();
  });
});

describe("trendFactsText & trendReply", () => {
  const s = summarize(result([11, 6, 4]))!;

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
  const turun = summarize(result([11, 6, 4]))!;
  const naik = summarize(result([2, 5, 9]))!;

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

  it("data naik-turun: jawaban yang menyebut kedua arah lolos, satu arah atau 'stabil' tidak", () => {
    const zigzag = summarize(result([10, 2, 10]))!;
    expect(contradictsTrend("Turun di September lalu naik lagi di Oktober.", zigzag)).toBe(false);
    expect(contradictsTrend("Penjualannya berfluktuasi.", zigzag)).toBe(false);
    expect(contradictsTrend("Penjualan turun terus.", zigzag)).toBe(true);
    expect(contradictsTrend("Penjualan stabil.", zigzag)).toBe(true);
  });

  it("data stabil: jawaban 'tidak naik maupun turun' dan 'stabil, sedikit naik' lolos, 'naik' saja tidak", () => {
    const flat = summarize(result([10, 10, 10]))!;
    expect(contradictsTrend("Stabil, tidak naik maupun turun.", flat)).toBe(false);
    expect(contradictsTrend("Cenderung stabil, hanya sedikit naik.", flat)).toBe(false);
    expect(contradictsTrend("Penjualan naik.", flat)).toBe(true);
  });

  it("bulan tertinggi: bulan pembanding tidak dihitung, tahun yang salah ketahuan", () => {
    const naikPuncakJan = summarize(result([9, 5, 2], "2026-01-01"))!; // turun, puncak Jan 2026
    expect(naikPuncakJan.peak?.label).toBe("Jan 2026");
    // Maret disebut sebagai puncak padahal puncaknya Januari.
    expect(contradictsTrend("Paling banyak terjual di Maret, turun dari Januari.", naikPuncakJan)).toBe(true);
    // Puncak yang disebut benar (Januari): lolos.
    expect(contradictsTrend("Paling banyak di Januari, turun sesudahnya.", naikPuncakJan)).toBe(false);
    expect(contradictsTrend("Penjualan turun dari Januari, paling banyak di Januari 2025.", naikPuncakJan)).toBe(true);
  });

  it("jawaban tanpa klaim arah lolos", () => {
    expect(contradictsTrend("Totalnya 21 buah dalam 3 bulan.", turun)).toBe(false);
  });
});
