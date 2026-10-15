/**
 * Tafsiran hasil getSalesTrend yang dihitung kode, bukan model. Q-13: data turun
 * 11 → 6 → 4, model menjawab "naik" dan "paling laku". Arah tren dan bulan
 * tertinggi dihitung di sini, lalu diberikan ke model sebagai fakta; kalau jawaban
 * model tetap bertentangan, jawaban diganti kalimat dari kode.
 */

export type TrendDirection = "naik" | "turun" | "stabil" | "tidak_ada_penjualan" | "tidak_cukup_data";

export interface TrendPoint {
  label: string;
  quantity: number;
}

export interface TrendSummary {
  points: TrendPoint[];
  total: number;
  direction: TrendDirection;
  /** Bulan tertinggi; null bila tren stabil, tidak ada penjualan, atau ada bulan yang sama tinggi. */
  peak: TrendPoint | null;
}

// Perubahan total (garis tren dari bulan pertama ke terakhir) di bawah 15% rata-rata dianggap stabil.
const STABLE_THRESHOLD = 0.15;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function periodLabel(period: string): { key: string; label: string } {
  const m = /^(\d{4})-(\d{2})/.exec(period);
  if (!m) return { key: period, label: period };
  const month = Number(m[2]);
  if (month < 1 || month > 12) return { key: period, label: period };
  return { key: `${m[1]}-${m[2]}`, label: `${MONTH_SHORT[month - 1]} ${m[1]}` };
}

export function summarizeTrend(result: unknown): TrendSummary | null {
  const trend = (result as { trend?: unknown } | null)?.trend;
  if (!Array.isArray(trend) || trend.length === 0) return null;

  const rows = trend
    .map((t) => {
      const row = t as { period?: unknown; total_keluar?: unknown };
      const qty = Number(row.total_keluar ?? 0);
      return { ...periodLabel(String(row.period ?? "")), quantity: Number.isFinite(qty) ? qty : 0 };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const points = rows.map(({ label, quantity }) => ({ label, quantity }));
  const total = points.reduce((sum, p) => sum + p.quantity, 0);
  const n = points.length;

  if (total === 0) return { points, total, direction: "tidak_ada_penjualan", peak: null };
  if (n < 2) return { points, total, direction: "tidak_cukup_data", peak: null };

  // Garis tren (kuadrat terkecil): perubahan sepanjang periode dibanding rata-rata.
  const mean = total / n;
  const xMean = (n - 1) / 2;
  let num = 0;
  let den = 0;
  points.forEach((p, x) => {
    num += (x - xMean) * (p.quantity - mean);
    den += (x - xMean) ** 2;
  });
  const change = (num / den) * (n - 1);
  const relative = change / mean;
  const direction: TrendDirection =
    Math.abs(relative) < STABLE_THRESHOLD ? "stabil" : relative > 0 ? "naik" : "turun";

  let peak: TrendPoint | null = null;
  if (direction !== "stabil") {
    const max = Math.max(...points.map((p) => p.quantity));
    const tops = points.filter((p) => p.quantity === max);
    peak = tops.length === 1 ? tops[0] : null;
  }
  return { points, total, direction, peak };
}

function perMonth(s: TrendSummary): string {
  return s.points.map((p) => `${p.label}: ${p.quantity}`).join(", ");
}

function directionText(s: TrendSummary): string {
  switch (s.direction) {
    case "naik":
      return "naik";
    case "turun":
      return "turun";
    case "stabil":
      return "stabil (hampir tidak berubah)";
    case "tidak_ada_penjualan":
      return "tidak ada penjualan";
    case "tidak_cukup_data":
      return "belum cukup data untuk menilai arah (hanya satu bulan)";
  }
}

/** Fakta untuk model, ditempel di hasil alat. */
export function trendFactsText(s: TrendSummary): string {
  const parts = [`arah tren: ${directionText(s)}`, `total ${s.total} buah`, `per bulan: ${perMonth(s)}`];
  if (s.peak) parts.push(`bulan tertinggi: ${s.peak.label} (${s.peak.quantity})`);
  return `FAKTA TREN (dihitung kode, pakai apa adanya; jangan menyebut arah atau bulan tertinggi yang berbeda): ${parts.join("; ")}.`;
}

/** Kalimat jawaban yang disusun kode. */
export function trendReply(s: TrendSummary, productName: string): string {
  const name = productName.trim() || "Barang ini";
  if (s.direction === "tidak_ada_penjualan") {
    return `${name}: tidak ada penjualan dalam ${s.points.length} bulan terakhir.`;
  }
  const lead =
    s.direction === "tidak_cukup_data"
      ? `Penjualan ${name}: baru ada data satu bulan, belum cukup untuk menilai tren.`
      : `Penjualan ${name} ${directionText(s)} dalam ${s.points.length} bulan terakhir.`;
  const peak = s.peak ? ` Paling banyak terjual di ${s.peak.label} (${s.peak.quantity}).` : "";
  return `${lead} Total ${s.total} buah (${perMonth(s)}).${peak}`;
}

const UP_RE = /\b(naik|meningkat|bertambah|menanjak|melonjak)\b/i;
const DOWN_RE = /\b(turun|menurun|berkurang|merosot|anjlok)\b/i;
const FLAT_RE = /\b(stabil|tetap|konsisten)\b/i;
const PEAK_CUE_RE = /(tertinggi|terbanyak|paling\s+(?:laku|banyak|tinggi)|puncak)/i;
const MONTH_RE =
  /\b(jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|agu(?:stus)?|ags|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?)\b/gi;
const MONTH_INDEX = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "ag", "sep", "okt", "nov", "des"];

function monthIndexOf(token: string): number {
  const t = token.toLowerCase();
  return MONTH_INDEX.findIndex((m) => t.startsWith(m));
}

/** Jawaban model bertentangan dengan arah atau bulan tertinggi hasil hitung kode. */
export function contradictsTrend(text: string, s: TrendSummary): boolean {
  const up = UP_RE.test(text);
  const down = DOWN_RE.test(text);
  const flat = FLAT_RE.test(text);
  switch (s.direction) {
    case "turun":
      if ((up || flat) && !down) return true;
      break;
    case "naik":
      if ((down || flat) && !up) return true;
      break;
    case "stabil":
    case "tidak_ada_penjualan":
    case "tidak_cukup_data":
      if (up || down) return true;
      break;
  }
  if (s.peak && PEAK_CUE_RE.test(text)) {
    const mentioned = [...text.matchAll(MONTH_RE)].map((m) => monthIndexOf(m[1]));
    const peakMonth = MONTH_SHORT.indexOf(s.peak.label.slice(0, 3));
    if (mentioned.length > 0 && !mentioned.includes(peakMonth)) return true;
  }
  return false;
}
