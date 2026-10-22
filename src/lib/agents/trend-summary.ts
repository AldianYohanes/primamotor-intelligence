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
  /**
   * Puncak (atau lembah) di tengah periode: bulan penuh pertama/terakhir bukan titik
   * tertinggi/terendah, dan kedua sisinya cukup besar. monthsAfter = jumlah bulan penuh
   * sesudahnya, yaitu "beberapa bulan terakhir" yang menunjukkan arah terkini.
   */
  turning?: { kind: "puncak" | "lembah"; point: TrendPoint; monthsAfter: number };
}

// Perubahan total (garis tren dari bulan pertama ke terakhir) di bawah 15% rata-rata dianggap datar.
const STABLE_THRESHOLD = 0.15;
// Garis datar tapi selisih bulan tertinggi dan terendah lebih dari 50% rata-rata: naik-turun, bukan stabil.
const FLUCTUATION_THRESHOLD = 0.5;
// Puncak/lembah di tengah dihitung bila selisihnya ke bulan penuh pertama dan terakhir masing-masing >= 25% rata-rata.
const TURN_LEG_THRESHOLD = 0.25;

/** Titik tertinggi (lalu terendah) yang unik, bukan di ujung, dengan dua sisi yang sama-sama berarti. */
function findTurning(full: TrendPoint[], mean: number): TrendSummary["turning"] {
  const q = full.map((p) => p.quantity);
  const last = q.length - 1;
  for (const [kind, target] of [
    ["puncak", Math.max(...q)],
    ["lembah", Math.min(...q)],
  ] as const) {
    const hits = q.flatMap((v, i) => (v === target ? [i] : []));
    if (hits.length !== 1) continue;
    const i = hits[0];
    if (i === 0 || i === last) continue;
    if (Math.abs(target - q[0]) >= TURN_LEG_THRESHOLD * mean && Math.abs(target - q[last]) >= TURN_LEG_THRESHOLD * mean) {
      return { kind, point: full[i], monthsAfter: last - i };
    }
  }
  return undefined;
}

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
  // Puncak/lembah di tengah menang atas garis lurus: 3, 5, 9, 11, 6 "naik" menurut garis,
  // tetapi arah terkininya turun, jadi disebut naik-turun lengkap dengan puncaknya.
  const turning = findTurning(full, mean);
  const direction: TrendDirection = turning
    ? "naik_turun"
    : Math.abs(relative) < STABLE_THRESHOLD
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
  return { points, total, direction, peak, ...(turning && { turning }) };
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
    case "naik_turun": {
      const t = s.turning;
      if (!t) return "naik-turun (berfluktuasi, tidak searah)";
      return t.kind === "puncak"
        ? `naik-turun: sempat naik sampai puncak di ${t.point.label}, lalu turun dalam ${t.monthsAfter} bulan terakhir`
        : `naik-turun: sempat turun sampai titik terendah di ${t.point.label}, lalu naik dalam ${t.monthsAfter} bulan terakhir`;
    }
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
      : s.turning
        ? `Penjualan ${name} ${directionText(s)}.`
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
      // Puncak di tengah: arah terkini turun, jadi menyebut "turun" cukup; lembah: "naik" cukup.
      // Tanpa titik balik, harus menyebut kedua arah atau kata naik-turun. "Stabil" atau satu
      // arah yang salah menyesatkan.
      if (FLUCTUATING_RE.test(text)) break;
      if (s.turning) {
        if (!(s.turning.kind === "puncak" ? down : up)) return true;
      } else if (!(up && down)) return true;
      break;
    case "tidak_ada_penjualan":
    case "tidak_cukup_data":
      if (up || down) return true;
      break;
  }
  if (s.peak && contradictsPeak(text, s.peak)) return true;
  return false;
}
