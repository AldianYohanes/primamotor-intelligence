/**
 * Periode tren penjualan yang ditulis staf ("3 bln", "2 bulan terakhir",
 * "setahun"). Model kecil sering menaruh periode itu di nama barang dan
 * mengosongkan `months` (Q-14), jadi kode yang membacanya dari teks.
 */

export const MAX_TREND_MONTHS = 24;

// Frasa penutup yang biasa menempel pada periode: "3 bulan terakhir", "6 bln lalu".
const TAIL = String.raw`(?:\s+(?:terakhir|belakangan|kebelakang|ke\s+belakang|lalu|kemarin|ini|ke\s+atas))?`;

const PATTERNS: { re: RegExp; months: (m: RegExpMatchArray) => number }[] = [
  { re: new RegExp(String.raw`\b(\d{1,2})\s*(?:bulan|bln|bl)\b${TAIL}`, "i"), months: (m) => Number(m[1]) },
  { re: new RegExp(String.raw`\b(\d{1,2})\s*(?:tahun|thn|th)\b${TAIL}`, "i"), months: (m) => Number(m[1]) * 12 },
  { re: new RegExp(String.raw`\bsetengah\s+(?:tahun|thn)\b${TAIL}`, "i"), months: () => 6 },
  { re: new RegExp(String.raw`\b(?:setahun|sethn)\b${TAIL}`, "i"), months: () => 12 },
  { re: new RegExp(String.raw`\bsebulan\b${TAIL}`, "i"), months: () => 1 },
];

export interface SalesPeriod {
  months: number;
  /** Frasa asli di teks, untuk dibuang dari nama barang. */
  phrase: string;
}

/** Periode pertama yang terbaca dari teks, atau null. Hasil dibatasi 1..24 bulan. */
export function parseSalesPeriod(text: string): SalesPeriod | null {
  for (const { re, months } of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const n = months(m);
    if (!Number.isFinite(n) || n < 1) continue;
    return { months: Math.min(n, MAX_TREND_MONTHS), phrase: m[0] };
  }
  return null;
}

/** Nama barang tanpa frasa periode; kembali ke teks asli bila hasilnya kosong. */
export function stripSalesPeriod(text: string): string {
  const period = parseSalesPeriod(text);
  if (!period) return text;
  const stripped = text.replace(period.phrase, " ").replace(/\s+/g, " ").trim();
  return stripped || text;
}
