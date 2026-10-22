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

// Ungkapan "barang tidak ada". Run 43 (Llama): "tidak ditemukan", "tidak ada di stok",
// "stok … di gudang tidak ada" lolos dari daftar lama yang hanya mengenal kosong/habis.
// "tidak ada" yang jelas bukan soal barang ("tidak ada perubahan/transaksi") dikecualikan.
const EMPTY_RE =
  /\b(?:kosong|habis|stok\s+nol|tidak\s+tersedia|tidak\s+ditemukan|tidak\s+(?:ada|punya)(?!\s+(?:perubahan|transaksi|masalah|catatan|yang\s+(?:di)?catat))|belum\s+ada\s+stok)\b/i;
const ALL_LOCATIONS_RE = /(semua|seluruh)\s+lokasi|di\s+mana[- ]?mana/i;
// Potongan kalimat untuk klaim kosong: "Gudangnya masih punya, tapi toko kosong" dinilai per bagian.
const CLAUSE_SPLIT_RE = /[,;]|\b(?:tapi|tetapi|namun|sedangkan|sementara)\b/i;

// Pemisah yang boleh ada antara nama lokasi dan angkanya, lalu angka yang bukan tanggal.
const QTY_AFTER_NAME = String.raw`(?:\s*[:=]\s*|\s+(?:ada|masih|sisa|stok|tinggal|sebanyak|punya|berjumlah)(?:\s+(?:ada|masih|sebanyak))?\s+|\s+)(\d+)(?![\d.,]*\d)(?!\s*(?:jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)\w*)`;

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lokasi yang disebut di teks; nama yang lebih panjang ("Toko Cabang") dicocokkan lebih dulu. */
function mentionedLocations(text: string, locations: StockLocation[]): StockLocation[] {
  let rest = text;
  const found: StockLocation[] = [];
  for (const l of [...locations].sort((a, b) => b.name.length - a.name.length)) {
    // Tanpa batas di akhir supaya "Gudangnya" tetap terbaca Gudang.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(l.name)}`, "giu");
    if (re.test(rest)) {
      found.push(l);
      rest = rest.replace(re, " ");
    }
  }
  return found;
}

/**
 * Klaim "tidak ada / kosong" yang bertentangan dengan data. Per potongan kalimat
 * (pertanyaan dilewati): tanpa lokasi atau "semua lokasi" = klaim untuk barangnya,
 * salah bila total > 0; menyebut lokasi = salah bila lokasi itu punya stok
 * (H-18: "di toko ini kosong" padahal Toko 9). "Toko kosong" saat Toko 0 tetap benar.
 */
function contradictsEmptyClaim(text: string, p: StockProduct): boolean {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => !s.trim().endsWith("?"));
  for (const sentence of sentences) {
    for (const clause of sentence.split(CLAUSE_SPLIT_RE)) {
      if (!EMPTY_RE.test(clause)) continue;
      const named = mentionedLocations(clause, p.locations);
      if (named.length === 0 || ALL_LOCATIONS_RE.test(clause)) {
        if (p.total > 0) return true;
      } else if (named.some((l) => l.quantity > 0)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Jawaban pembacaan stok yang bertentangan dengan data: mengaku mencatat,
 * bilang kosong padahal ada stok, atau angka per lokasi yang salah.
 */
export function contradictsStock(text: string, s: StockSummary): boolean {
  if (claimsRecorded(text)) return true;
  if (s.products.length !== 1) return false;
  const p = s.products[0];

  if (contradictsEmptyClaim(text, p)) return true;
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
