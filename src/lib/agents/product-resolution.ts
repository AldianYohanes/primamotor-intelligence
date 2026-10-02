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

/** "Toko 2 · Gudang 3" dari available_quantity per lokasi. */
export function describeStock(product: ProductSearchResult): string {
  const rows = product.stock_by_location ?? [];
  if (rows.length === 0) return "belum ada stok tercatat";
  return rows
    .map((r) => `${r.location_name ?? "Lokasi"} ${r.available_quantity ?? r.quantity ?? 0}`)
    .join(" · ");
}
