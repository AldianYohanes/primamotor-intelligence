import { compactStockResult } from "@/src/lib/agents/product-resolution";

/**
 * Kalimat stok per lokasi yang disusun kode dari hasil getStock. Q-07: stok
 * Toko 0, Gudang 2 dijawab model "kosong di semua lokasi" dan "sudah saya catat"
 * padahal staf hanya bertanya. Bila jawaban model bertentangan dengan data,
 * jawabannya diganti kalimat dari kode.
 */

export interface StockLocation {
  name: string;
  quantity: number;
}

export interface StockProduct {
  name: string;
  locations: StockLocation[];
  total: number;
}

export interface StockSummary {
  products: StockProduct[];
}

const MAX_PRODUCTS = 3;

export function summarizeStock(result: unknown): StockSummary | null {
  // compactStockResult menggabungkan baris per produk (cache offline: satu baris per lokasi).
  const compact = compactStockResult(result) as { results?: unknown } | null;
  if (!compact || !Array.isArray(compact.results) || compact.results.length === 0) return null;
  const products = (
    compact.results as { name: string; available_quantity_per_location?: Record<string, number> }[]
  ).map((p) => {
    const locations = Object.entries(p.available_quantity_per_location ?? {}).map(([name, quantity]) => ({
      name,
      quantity: Number(quantity) || 0,
    }));
    return { name: p.name, locations, total: locations.reduce((sum, l) => sum + l.quantity, 0) };
  });
  return { products };
}

function productLine(p: StockProduct): string {
  if (p.locations.length === 0) return `${p.name}: belum ada data stok per lokasi.`;
  const per = p.locations.map((l) => `${l.name} ${l.quantity}`).join(", ");
  if (p.total === 0) return `${p.name}: kosong di semua lokasi (${per}).`;
  return `Stok ${p.name}: ${per} (total ${p.total}).`;
}

export function stockReply(s: StockSummary, opts: { notRecorded?: boolean } = {}): string {
  const shown = s.products.slice(0, MAX_PRODUCTS);
  const lines = shown.map(productLine);
  if (s.products.length > shown.length) lines.push(`Ada ${s.products.length - shown.length} barang lain yang mirip; sebut nama lengkapnya kalau perlu.`);
  const text = lines.join("\n");
  return opts.notRecorded ? `${text}\nBelum ada perubahan stok yang dicatat; ini hanya pengecekan.` : text;
}

const RECORDED_RE =
  /\b(sudah|telah|berhasil|sukses)\s+(?:saya\s+|kami\s+)?(?:di|ter)?(?:catat|mencatat|simpan|menyimpan|update|perbarui|memperbarui|ubah|mengubah)\w*|\b(?:dicatat|tersimpan|saya\s+catat)\b/i;
// Kata sebelum "dicatat" yang membuatnya bukan klaim: "belum dicatat", "mau dicatat keluar dari mana?".
const NOT_A_CLAIM_RE = /\b(?:belum|akan|mau|bisa|perlu|ingin|tidak|nggak|gak|tanpa|jika|kalau|supaya|agar)\b/i;

/**
 * Jawaban mengaku sudah mencatat/mengubah stok. Dinilai per kalimat: pertanyaan
 * dan kalimat yang didahului "belum/mau/akan/..." bukan klaim, dan "tercatat"
 * saja ("stok yang tercatat di Gudang 2") hanya kata baca yang wajar.
 */
export function claimsRecorded(text: string): boolean {
  return text.split(/(?<=[.!?])\s+|\n+/).some((sentence) => {
    const m = RECORDED_RE.exec(sentence);
    if (!m) return false;
    if (sentence.trim().endsWith("?")) return false;
    return !NOT_A_CLAIM_RE.test(sentence.slice(0, m.index));
  });
}

const EMPTY_RE = /\b(kosong|habis|tidak\s+ada\s+stok|tidak\s+tersedia|stok\s+nol)\b/i;
const ALL_LOCATIONS_RE = /(semua|seluruh)\s+lokasi|di\s+mana[- ]?mana/i;

// Pemisah yang boleh ada antara nama lokasi dan angkanya, lalu angka yang bukan tanggal.
const QTY_AFTER_NAME = String.raw`(?:\s*[:=]\s*|\s+(?:ada|masih|sisa|stok|tinggal|sebanyak|punya|berjumlah)(?:\s+(?:ada|masih|sebanyak))?\s+|\s+)(\d+)(?![\d.,]*\d)(?!\s*(?:jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)\w*)`;

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Jawaban pembacaan stok yang bertentangan dengan data: mengaku mencatat,
 * bilang kosong padahal ada stok, atau angka per lokasi yang salah.
 */
export function contradictsStock(text: string, s: StockSummary): boolean {
  if (claimsRecorded(text)) return true;
  if (s.products.length !== 1) return false;
  const p = s.products[0];

  if (p.total > 0 && EMPTY_RE.test(text)) {
    const namesLocation = p.locations.some((l) => new RegExp(escapeRe(l.name), "i").test(text));
    if (!namesLocation || ALL_LOCATIONS_RE.test(text)) return true;
  }
  // Angka tepat sesudah nama lokasi harus sama dengan data ("Toko ada 5" padahal 0).
  // Hanya pola jelas yang dibandingkan ("Toko 0", "Toko: 0", "Toko ada 0"); kata lain di
  // antaranya ("Gudang dan Toko total 2", "Gudang (cek 12 Okt): 4") dilewati.
  for (const l of p.locations) {
    // Nama lokasi yang saling awalan ("Toko" vs "Toko Cabang"): nama yang lebih panjang disingkirkan dulu.
    let scoped = text;
    for (const other of p.locations) {
      if (other.name.length > l.name.length && other.name.toLowerCase().startsWith(l.name.toLowerCase())) {
        scoped = scoped.replace(new RegExp(escapeRe(other.name), "gi"), " ");
      }
    }
    const m = new RegExp(`${escapeRe(l.name)}(?![\\p{L}\\p{N}])${QTY_AFTER_NAME}`, "iu").exec(scoped);
    if (m && Number(m[1]) !== l.quantity) return true;
  }
  return false;
}
