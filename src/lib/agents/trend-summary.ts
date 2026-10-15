/**
 * Tafsiran hasil getSalesTrend yang dihitung kode, bukan model. Q-13: data turun
 * 11 → 6 → 4, model menjawab "naik" dan "paling laku". Arah tren dan bulan
 * tertinggi dihitung di sini, lalu diberikan ke model sebagai fakta; kalau jawaban
 * model tetap bertentangan, jawaban diganti kalimat dari kode.
 */

export type TrendDirection =
  | "naik"
  | "turun"
  | "stabil"
  | "naik_turun"
  | "tidak_ada_penjualan"
  | "tidak_cukup_data";

export interface TrendPoint {
  label: string;
  quantity: number;
  /** Bulan berjalan (belum penuh): ditampilkan, tapi tidak ikut menghitung arah dan bulan tertinggi. */
  partial?: boolean;
}

export interface TrendSummary {
  points: TrendPoint[];
  total: number;
  direction: TrendDirection;
  /** Bulan tertinggi; null bila tren stabil, tidak ada penjualan, atau ada bulan yang sama tinggi. */
  peak: TrendPoint | null;
}

// Perubahan total (garis tren dari bulan pertama ke terakhir) di bawah 15% rata-rata dianggap datar.
const STABLE_THRESHOLD = 0.15;
// Garis datar tapi selisih bulan tertinggi dan terendah lebih dari 50% rata-rata: naik-turun, bukan stabil.
const FLUCTUATION_THRESHOLD = 0.5;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function periodLabel(period: string): { key: string; label: string } {
  const m = /^(\d{4})-(\d{2})/.exec(period);
  if (!m) return { key: period, label: period };
  const month = Number(m[2]);
  if (month < 1 || month > 12) return { key: period, label: period };
  return { key: `${m[1]}-${m[2]}`, label: `${MONTH_SHORT[month - 1]} ${m[1]}` };
}

/**
 * @param now Waktu sekarang (UTC, seperti date_trunc('month', now()) di get_sales_trend).
 *   Titik terakhir yang jatuh di bulan ini baru terisi sebagian, jadi dikeluarkan dari
 *   hitungan arah: stabil 10 per bulan dan 5 di tengah bulan bukan "turun".
 */
export function summarizeTrend(result: unknown, now: Date = new Date()): TrendSummary | null {
  const trend = (result as { trend?: unknown } | null)?.trend;
  if (!Array.isArray(trend) || trend.length === 0) return null;

  const rows = trend
    .map((t) => {
      const row = t as { period?: unknown; total_keluar?: unknown };
      const qty = Number(row.total_keluar ?? 0);
      return { ...periodLabel(String(row.period ?? "")), quantity: Number.isFinite(qty) ? qty : 0 };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const last = rows.length - 1;
  const points: TrendPoint[] = rows.map(({ key, label, quantity }, i) =>
    i === last && key === currentKey ? { label, quantity, partial: true } : { label, quantity },
  );
  const total = points.reduce((sum, p) => sum + p.quantity, 0);
  // Arah dan bulan tertinggi hanya dari bulan penuh.
  const full = points.filter((p) => !p.partial);
  const fullTotal = full.reduce((sum, p) => sum + p.quantity, 0);
  const n = full.length;

  if (total === 0) return { points, total, direction: "tidak_ada_penjualan", peak: null };
  if (n < 2 || fullTotal === 0) return { points, total, direction: "tidak_cukup_data", peak: null };

  // Garis tren (kuadrat terkecil): perubahan sepanjang periode dibanding rata-rata.
  const mean = fullTotal / n;
  const xMean = (n - 1) / 2;
  let num = 0;
  let den = 0;
  full.forEach((p, x) => {
    num += (x - xMean) * (p.quantity - mean);
    den += (x - xMean) ** 2;
  });
  const change = (num / den) * (n - 1);
  const relative = change / mean;
  const quantities = full.map((p) => p.quantity);
  const spread = (Math.max(...quantities) - Math.min(...quantities)) / mean;
  const direction: TrendDirection =
    Math.abs(relative) < STABLE_THRESHOLD
      ? spread > FLUCTUATION_THRESHOLD
        ? "naik_turun"
        : "stabil"
      : relative > 0
        ? "naik"
        : "turun";

  let peak: TrendPoint | null = null;
  if (direction !== "stabil") {
    const max = Math.max(...quantities);
    const tops = full.filter((p) => p.quantity === max);
    peak = tops.length === 1 ? tops[0] : null;
  }
  return { points, total, direction, peak };
}

function perMonth(s: TrendSummary): string {
  return s.points.map((p) => `${p.label}: ${p.quantity}${p.partial ? " (bulan berjalan, belum penuh)" : ""}`).join(", ");
}

function directionText(s: TrendSummary): string {
  switch (s.direction) {
    case "naik":
      return "naik";
    case "turun":
      return "turun";
    case "stabil":
      return "stabil (hampir tidak berubah)";
    case "naik_turun":
      return "naik-turun (berfluktuasi, tidak searah)";
    case "tidak_ada_penjualan":
      return "tidak ada penjualan";
    case "tidak_cukup_data":
      return "belum cukup data untuk menilai arah (kurang dari dua bulan penuh)";
  }
}

/** Fakta untuk model, ditempel di hasil alat. */
export function trendFactsText(s: TrendSummary): string {
  const note = s.points.some((p) => p.partial) ? " (bulan berjalan tidak dihitung)" : "";
  const parts = [`arah tren${note}: ${directionText(s)}`, `total ${s.total} buah`, `per bulan: ${perMonth(s)}`];
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
      ? `Penjualan ${name}: belum ada dua bulan penuh, belum cukup untuk menilai tren.`
      : `Penjualan ${name} ${directionText(s)} dalam ${s.points.length} bulan terakhir.`;
  const peak = s.peak ? ` Paling banyak terjual di ${s.peak.label} (${s.peak.quantity}).` : "";
  return `${lead} Total ${s.total} buah (${perMonth(s)}).${peak}`;
}

const UP_RE = /\b(naik|meningkat|bertambah|menanjak|melonjak)\b/i;
const DOWN_RE = /\b(turun|menurun|berkurang|merosot|anjlok)\b/i;
const FLAT_RE = /\b(stabil|tetap|konsisten)\b/i;
const FLUCTUATING_RE = /\b(naik[\s-]+turun|turun[\s-]+naik|fluktuasi|fluktuatif|berfluktuasi|tidak\s+(?:menentu|searah|stabil)|bergejolak)\b/i;
const PEAK_CUE_RE = /(tertinggi|terbanyak|paling\s+(?:laku|banyak|tinggi)|puncak)/i;
const MONTH_PATTERN =
  "jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|agu(?:stus)?|ags|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?";
const MONTH_YEAR_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${MONTH_PATTERN})(?![\\p{L}\\p{N}])(?:\\s+(\\d{4}))?`, "giu");
// Bulan pembanding ("naik dari Januari", "dibanding Februari") bukan klaim bulan tertinggi.
const COMPARISON_BEFORE_RE = /(?:dari|sejak|setelah|sebelum|dibanding(?:kan)?(?:\s+dengan)?|daripada|ketimbang)\s+(?:bulan\s+)?$/i;
const MONTH_INDEX = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "ag", "sep", "okt", "nov", "des"];

function monthIndexOf(token: string): number {
  const t = token.toLowerCase();
  return MONTH_INDEX.findIndex((m) => t.startsWith(m));
}

/**
 * Klaim "bulan tertinggi" di jawaban dicek per anak kalimat: bulan yang disebut
 * sebagai pembanding diabaikan, dan tahun (kalau disebut) harus cocok.
 */
function contradictsPeak(text: string, peak: TrendPoint): boolean {
  const peakMonth = MONTH_SHORT.indexOf(peak.label.slice(0, 3));
  const peakYear = Number(peak.label.slice(4));
  for (const clause of text.split(/[.;!?,\n]+/)) {
    if (!PEAK_CUE_RE.test(clause)) continue;
    const claimed: { month: number; year: number | null }[] = [];
    for (const m of clause.matchAll(MONTH_YEAR_RE)) {
      if (COMPARISON_BEFORE_RE.test(clause.slice(0, m.index))) continue;
      claimed.push({ month: monthIndexOf(m[1]), year: m[2] ? Number(m[2]) : null });
    }
    if (claimed.length === 0) continue;
    if (!claimed.some((c) => c.month === peakMonth && (c.year === null || c.year === peakYear))) return true;
  }
  return false;
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
      // "stabil, tidak naik maupun turun" dan "turun di Feb lalu naik lagi" bukan salah arah.
      if (up !== down && !flat) return true;
      break;
    case "naik_turun":
      // Harus menyebut kedua arah atau kata naik-turun; satu arah saja atau "stabil" menyesatkan.
      if (!(up && down) && !FLUCTUATING_RE.test(text)) return true;
      break;
    case "tidak_ada_penjualan":
    case "tidak_cukup_data":
      if (up || down) return true;
      break;
  }
  if (s.peak && contradictsPeak(text, s.peak)) return true;
  return false;
}
