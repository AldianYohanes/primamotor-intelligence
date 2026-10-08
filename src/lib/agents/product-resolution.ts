/**
 * Memilih produk dari hasil pencarian fuzzy (search_products via getStock) untuk
 * alat transaksi satu langkah: model menulis nama barang, kode yang memilih.
 */

export interface StockLocationRow {
  location_id: string;
  location_name?: string;
  available_quantity?: number;
  quantity?: number;
}

export interface ProductSearchResult {
  product_id: string;
  name: string;
  part_number?: string | null;
  similarity_score?: number;
  stock_by_location?: StockLocationRow[];
}

export type ProductPick =
  | { status: "match"; product: ProductSearchResult }
  | { status: "ambiguous"; candidates: ProductSearchResult[] }
  | { status: "none" };

// Kandidat teratas diambil otomatis bila cocok persis, satu-satunya hasil yang
// cukup mirip, atau unggul jelas dari kandidat kedua.
const MIN_SIMILARITY = 0.3;
const CLEAR_WINNER_MIN = 0.5;
const CLEAR_WINNER_GAP = 0.15;
const MAX_CANDIDATES = 5;

/** search_products bisa mengembalikan produk sama dua kali (cocok lewat nama & alias). */
export function dedupeResults<T extends ProductSearchResult>(results: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of results) {
    const prev = best.get(r.product_id);
    if (!prev || (r.similarity_score ?? 0) > (prev.similarity_score ?? 0)) best.set(r.product_id, r);
  }
  return [...best.values()].sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0));
}

export function pickProduct(results: ProductSearchResult[]): ProductPick {
  // Hasil cache offline tidak punya similarity_score; dianggap relevan.
  const relevant = dedupeResults(results).filter((r) => (r.similarity_score ?? 1) >= MIN_SIMILARITY);
  if (relevant.length === 0) return { status: "none" };
  const [top, second] = relevant;
  const topScore = top.similarity_score ?? 1;
  if (
    relevant.length === 1 ||
    topScore >= 0.999 ||
    (topScore >= CLEAR_WINNER_MIN && topScore - (second.similarity_score ?? 0) >= CLEAR_WINNER_GAP)
  ) {
    return { status: "match", product: top };
  }
  return { status: "ambiguous", candidates: relevant.slice(0, MAX_CANDIDATES) };
}

/**
 * Hasil getStock versi model: tanpa UUID lokasi, reserved, dan jejak pencocokan.
 * Run 24/27: hasil lengkap membuat prompt sampai 4.660 token dan model menyalin
 * UUID lokasi ke argumen transfer. Nama field dipertahankan sesuai yang dirujuk
 * prompt (product_id, similarity_score, available_quantity, source, …).
 * toolTrace tetap menyimpan hasil lengkap untuk evaluasi.
 */
export function compactStockResult(result: unknown): unknown {
  if (!result || typeof result !== "object" || !Array.isArray((result as { results?: unknown }).results)) {
    return result;
  }
  const { results, ...rest } = result as { results: ProductSearchResult[] };
  // Digabung per produk, bukan dedupe: cache offline memberi satu baris per lokasi.
  const byProduct = new Map<string, { product: ProductSearchResult; stock: Record<string, number> }>();
  for (const p of results) {
    const entry = byProduct.get(p.product_id) ?? { product: p, stock: {} };
    if ((p.similarity_score ?? 0) > (entry.product.similarity_score ?? 0)) entry.product = p;
    for (const r of p.stock_by_location ?? []) {
      entry.stock[r.location_name ?? r.location_id] = r.available_quantity ?? r.quantity ?? 0;
    }
    byProduct.set(p.product_id, entry);
  }
  return {
    ...rest,
    results: [...byProduct.values()].map(({ product: p, stock }) => ({
      product_id: p.product_id,
      name: p.name,
      ...(p.part_number && { part_number: p.part_number }),
      ...(p.similarity_score !== undefined && { similarity_score: Math.round(p.similarity_score * 100) / 100 }),
      available_quantity_per_location: stock,
    })),
  };
}

const LARGE_QUANTITY_ABSOLUTE = 100;
const LARGE_QUANTITY_FACTOR = 5;
const LARGE_QUANTITY_MIN = 20;

/**
 * Peringatan untuk barang masuk yang jumlahnya tidak wajar (Run 18–27, S-02:
 * "masuk 10000 filter oli" lolos sampai konfirmasi). Hanya peringatan; staf
 * tetap bisa melanjutkan dengan PIN. Barang keluar/transfer sudah dibatasi stok
 * oleh server.
 */
export function largeQuantityWarning(quantity: number, product: ProductSearchResult | null): string | null {
  const total = product
    ? (product.stock_by_location ?? []).reduce((sum, r) => sum + (r.quantity ?? r.available_quantity ?? 0), 0)
    : null;
  const fmt = (n: number) => n.toLocaleString("id-ID");
  if (total !== null && quantity >= LARGE_QUANTITY_MIN && quantity > LARGE_QUANTITY_FACTOR * total) {
    return `Perhatian: ${fmt(quantity)} unit jauh di atas stok sekarang (${fmt(total)} unit). Pastikan angkanya benar sebelum memasukkan PIN.`;
  }
  if (quantity >= LARGE_QUANTITY_ABSOLUTE) {
    return `Perhatian: jumlahnya besar (${fmt(quantity)} unit). Pastikan angkanya benar sebelum memasukkan PIN.`;
  }
  return null;
}

/** "Toko 2 · Gudang 3" dari available_quantity per lokasi. */
export function describeStock(product: ProductSearchResult): string {
  const rows = product.stock_by_location ?? [];
  if (rows.length === 0) return "belum ada stok tercatat";
  return rows
    .map((r) => `${r.location_name ?? "Lokasi"} ${r.available_quantity ?? r.quantity ?? 0}`)
    .join(" · ");
}
