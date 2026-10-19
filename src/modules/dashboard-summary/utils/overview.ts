// Fungsi murni (tanpa I/O) untuk ringkasan dashboard: penjualan per bulan,
// barang terlaris, dan stok menipis. Dipisah dari route handler supaya bisa
// dites tanpa mock database.

// Bulan dihitung menurut WIB (UTC+7), zona waktu toko, bukan UTC. Tanpa ini
// nota jam 00.00-07.00 WIB masuk ke bulan sebelumnya.
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function wibMonthKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS);
  return d.toISOString().slice(0, 7);
}

/** Daftar kunci bulan 'YYYY-MM', paling lama dulu, berakhir di bulan `now`. */
export function lastMonthKeys(now: Date, months: number): string[] {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

/** Awal bulan pertama dalam rentang, dalam UTC (untuk filter created_at). */
export function monthRangeStartUtc(now: Date, months: number): Date {
  const [y, m] = lastMonthKeys(now, months)[0].split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1) - WIB_OFFSET_MS);
}

export interface SaleInput {
  total_amount: number;
  created_at: string;
}

export interface MonthlySalesPoint {
  month: string;
  revenue: number;
  transaction_count: number;
}

export function buildMonthlySales(
  sales: SaleInput[],
  now: Date,
  months: number,
): MonthlySalesPoint[] {
  const map = new Map<string, MonthlySalesPoint>(
    lastMonthKeys(now, months).map((month) => [
      month,
      { month, revenue: 0, transaction_count: 0 },
    ]),
  );
  for (const s of sales) {
    const bucket = map.get(wibMonthKey(s.created_at));
    if (!bucket) continue;
    bucket.revenue += s.total_amount;
    bucket.transaction_count += 1;
  }
  return Array.from(map.values());
}

export interface SaleItemInput {
  product_id: string;
  quantity: number;
  subtotal: number;
}

export interface TopProductAggregate {
  product_id: string;
  quantity: number;
  revenue: number;
}

export function buildTopProducts(
  items: SaleItemInput[],
  limit: number,
): TopProductAggregate[] {
  const map = new Map<string, TopProductAggregate>();
  for (const it of items) {
    const cur = map.get(it.product_id) ?? {
      product_id: it.product_id,
      quantity: 0,
      revenue: 0,
    };
    cur.quantity += it.quantity;
    cur.revenue += it.subtotal;
    map.set(it.product_id, cur);
  }
  return Array.from(map.values())
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, limit);
}

export interface LowStockProductInput {
  id: string;
  name: string;
  part_number: string | null;
  unit: string;
  min_threshold: number | null;
}

export interface LowStockStockInput {
  product_id: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity?: number | null;
}

export interface LowStockItem {
  product_id: string;
  name: string;
  part_number: string | null;
  unit: string;
  available_quantity: number;
  min_threshold: number;
}

// Definisi "menipis" sama dengan halaman Stok per Lokasi (is_low): total
// stok tersedia semua lokasi <= batas minimum. Produk tanpa batas minimum
// tidak dihitung. Diurutkan dari yang paling kritis (selisih terbesar).
export function buildLowStock(
  products: LowStockProductInput[],
  stock: LowStockStockInput[],
): LowStockItem[] {
  const available = new Map<string, number>();
  for (const s of stock) {
    const a = s.available_quantity ?? s.quantity - s.reserved_quantity;
    available.set(s.product_id, (available.get(s.product_id) ?? 0) + a);
  }
  const out: LowStockItem[] = [];
  for (const p of products) {
    if (p.min_threshold == null) continue;
    const a = available.get(p.id) ?? 0;
    if (a <= p.min_threshold) {
      out.push({
        product_id: p.id,
        name: p.name,
        part_number: p.part_number,
        unit: p.unit,
        available_quantity: a,
        min_threshold: p.min_threshold,
      });
    }
  }
  return out.sort(
    (x, y) =>
      x.available_quantity -
        x.min_threshold -
        (y.available_quantity - y.min_threshold) || x.name.localeCompare(y.name),
  );
}
