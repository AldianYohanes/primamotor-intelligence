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
  /\b(sudah|telah|berhasil|sukses)\s+(?:saya\s+|kami\s+)?(?:di)?(?:catat|mencatat|simpan|menyimpan|update|perbarui|memperbarui|ubah|mengubah)\w*|\b(?:dicatat|tercatat|tersimpan|saya\s+catat)\b/i;

/** Jawaban mengaku sudah mencatat/mengubah stok. */
export function claimsRecorded(text: string): boolean {
  return RECORDED_RE.test(text);
}

const EMPTY_RE = /\b(kosong|habis|tidak\s+ada\s+stok|tidak\s+tersedia|stok\s+nol)\b/i;
const ALL_LOCATIONS_RE = /(semua|seluruh)\s+lokasi|di\s+mana[- ]?mana/i;

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
  // Celah dibatasi tanpa koma/titik supaya tidak mengambil angka lokasi berikutnya.
  for (const l of p.locations) {
    const m = new RegExp(`${escapeRe(l.name)}[^\\d,;.\\n]{0,15}?(\\d+)`, "i").exec(text);
    if (m && Number(m[1]) !== l.quantity) return true;
  }
  return false;
}
