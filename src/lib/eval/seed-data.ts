/**
 * Isi tenant evaluasi, salinan supabase/seed_eval.sql untuk tombol "Reset data eval"
 * di /eval (route /api/eval/seed). Kalau angka di seed_eval.sql diubah, ubah juga di
 * sini (dan sebaliknya); test seed-data.test.ts memeriksa saldo akhirnya.
 *
 * Nomor part, kuantitas, harga, dan riwayat penjualan SINTETIS — bukan data mitra.
 */

export const EVAL_BUSINESS_ID = "e0000000-0000-0000-0000-00000000e001";
export const EVAL_TOKO_ID = "e0000000-0ca0-0000-0000-000000000001";
export const EVAL_GUDANG_ID = "e0000000-0ca0-0000-0000-000000000002";

export const EVAL_BUSINESS = {
  id: EVAL_BUSINESS_ID,
  name: "Prima Motor (Evaluasi)",
  slug: "eval-prima-motor",
  address: "Tenant uji, bukan toko nyata",
  status: "active",
} as const;

export const EVAL_LOCATIONS = [
  { id: EVAL_TOKO_ID, business_id: EVAL_BUSINESS_ID, name: "Toko", type: "toko", latitude: -6.2441, longitude: 106.8 },
  { id: EVAL_GUDANG_ID, business_id: EVAL_BUSINESS_ID, name: "Gudang", type: "gudang", latitude: -6.2665, longitude: 106.804 },
] as const;

const pid = (n: number) => `e0000000-0d0c-0000-0000-${String(n).padStart(12, "0")}`;

type ProductSeed = {
  n: number;
  name: string;
  category: string;
  unit: string;
  minThreshold: number;
  unitCost: number;
  sellingPrice: number;
  /** Saldo akhir yang diinginkan. */
  toko: number;
  gudang: number;
  /** Jumlah keluar di Toko per bulan, dari 5 bulan lalu sampai bulan ini. */
  sales: [number, number, number, number, number, number];
};

const PRODUCTS: ProductSeed[] = [
  { n: 1, name: "Timing Belt Volvo 240 B230", category: "Sabuk penggerak mesin", unit: "pcs", minThreshold: 3, unitCost: 350000, sellingPrice: 480000, toko: 6, gudang: 14, sales: [2, 3, 2, 4, 3, 2] },
  { n: 2, name: "V-Belt Alternator", category: "Sabuk penggerak mesin", unit: "pcs", minThreshold: 4, unitCost: 90000, sellingPrice: 135000, toko: 8, gudang: 20, sales: [3, 2, 4, 3, 5, 2] },
  { n: 3, name: "Radiator Volvo 240", category: "Sistem pendingin", unit: "unit", minThreshold: 1, unitCost: 1800000, sellingPrice: 2450000, toko: 2, gudang: 3, sales: [0, 1, 0, 1, 1, 0] },
  { n: 4, name: "Kampas Rem Depan Brembo", category: "Sistem pengereman", unit: "set", minThreshold: 4, unitCost: 420000, sellingPrice: 590000, toko: 10, gudang: 16, sales: [4, 5, 3, 6, 5, 4] },
  { n: 5, name: "Bushing Arm Suspensi Depan", category: "Suspensi/karet", unit: "pcs", minThreshold: 6, unitCost: 75000, sellingPrice: 115000, toko: 12, gudang: 30, sales: [6, 4, 8, 5, 7, 3] },
  { n: 6, name: "Filter Oli Mahle", category: "Filter", unit: "pcs", minThreshold: 10, unitCost: 65000, sellingPrice: 95000, toko: 25, gudang: 60, sales: [18, 22, 20, 25, 24, 12] },
  { n: 7, name: "Filter Udara Mahle", category: "Filter", unit: "pcs", minThreshold: 5, unitCost: 110000, sellingPrice: 160000, toko: 9, gudang: 15, sales: [5, 6, 4, 7, 6, 3] },
  { n: 8, name: "Bilah Wiper Bosch 20 inch", category: "Wiper", unit: "pcs", minThreshold: 6, unitCost: 80000, sellingPrice: 125000, toko: 14, gudang: 20, sales: [3, 5, 9, 11, 6, 4] },
  { n: 9, name: "Sabuk Multi-Rib Continental", category: "Sabuk penggerak mesin", unit: "pcs", minThreshold: 3, unitCost: 180000, sellingPrice: 260000, toko: 5, gudang: 7, sales: [1, 2, 1, 2, 2, 1] },
  { n: 10, name: "Oli Diferensial Limited-Slip", category: "Cairan/pelumas", unit: "botol", minThreshold: 4, unitCost: 140000, sellingPrice: 195000, toko: 4, gudang: 12, sales: [2, 1, 2, 2, 1, 1] },
  { n: 11, name: "Tangki Air Radiator Febi", category: "Sistem pendingin", unit: "unit", minThreshold: 2, unitCost: 650000, sellingPrice: 880000, toko: 1, gudang: 2, sales: [1, 0, 1, 0, 1, 0] },
  { n: 12, name: "Lampu Belakang Kiri Depo", category: "Kelistrikan/pencahayaan", unit: "unit", minThreshold: 1, unitCost: 550000, sellingPrice: 760000, toko: 0, gudang: 4, sales: [0, 1, 0, 0, 1, 0] },
  { n: 13, name: "Lampu Depan Hella Volvo 240", category: "Kelistrikan/pencahayaan", unit: "unit", minThreshold: 1, unitCost: 900000, sellingPrice: 1250000, toko: 3, gudang: 5, sales: [1, 0, 1, 1, 0, 1] },
  { n: 14, name: "Gril Depan Volvo 240", category: "Bodi/eksterior", unit: "unit", minThreshold: 1, unitCost: 1200000, sellingPrice: 1650000, toko: 1, gudang: 0, sales: [0, 0, 1, 0, 0, 0] },
  { n: 15, name: "Mud Flap Belakang", category: "Bodi/eksterior", unit: "pasang", minThreshold: 2, unitCost: 150000, sellingPrice: 220000, toko: 6, gudang: 10, sales: [1, 2, 1, 1, 2, 1] },
  { n: 16, name: "Stoplamp Volvo 740", category: "Kelistrikan/pencahayaan", unit: "unit", minThreshold: 1, unitCost: 600000, sellingPrice: 840000, toko: 2, gudang: 2, sales: [0, 1, 0, 0, 0, 1] },
  { n: 17, name: "Karburator Volvo 240", category: "Bahan bakar", unit: "unit", minThreshold: 1, unitCost: 2100000, sellingPrice: 2900000, toko: 1, gudang: 1, sales: [0, 0, 0, 1, 0, 0] },
];

const ALIASES: [number, string][] = [
  [3, "rediator"],
  [4, "brake pads"],
  [4, "kampas rem"],
  [7, "luftfilter"],
  [7, "saringan udara"],
  [8, "wiper"],
  [9, "multi v-belt"],
  [9, "keilrippenriemen"],
  [10, "oli gardan"],
  [11, "tank air radiator"],
  [11, "tabung air radiator"],
  [12, "tail lamp kiri"],
  [12, "stop kiri"],
  [13, "headlamp"],
  [14, "grill"],
  [15, "pelindung lumpur"],
  [17, "karbu"],
  [17, "karburator"],
];

export const EVAL_PRODUCTS = PRODUCTS.map((p) => ({
  id: pid(p.n),
  business_id: EVAL_BUSINESS_ID,
  part_number: `EVAL-${String(p.n).padStart(3, "0")}`,
  name: p.name,
  category: p.category,
  unit: p.unit,
  min_threshold: p.minThreshold,
  unit_cost: p.unitCost,
  selling_price: p.sellingPrice,
}));

export const EVAL_ALIASES = ALIASES.map(([n, alias]) => ({ product_id: pid(n), alias, source: "eval" }));

export type SeedTransaction = {
  business_id: string;
  product_id: string;
  location_id: string;
  transaction_type: "masuk" | "keluar";
  quantity: number;
  notes: string;
  created_at: string;
};

/** Awal bulan (UTC) `monthsAgo` bulan sebelum bulan `now`, seperti date_trunc('month', now()) di SQL. */
function monthStart(now: Date, monthsAgo: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
}

/**
 * Ledger awal, urut seperti seed_eval.sql: saldo awal masuk 6 bulan lalu, lalu riwayat
 * keluar di Toko per bulan (tanggal 10, paling lambat 1 jam sebelum sekarang). Saldo
 * tabel stock dibentuk trigger dari ledger ini, sama seperti jalur produksi.
 */
export function buildSeedTransactions(now: Date): { opening: SeedTransaction[]; sales: SeedTransaction[] } {
  const openingAt = monthStart(now, 6).toISOString();
  const opening: SeedTransaction[] = [];
  for (const p of PRODUCTS) {
    const soldTotal = p.sales.reduce((a, b) => a + b, 0);
    for (const [location_id, qty] of [
      [EVAL_TOKO_ID, p.toko + soldTotal],
      [EVAL_GUDANG_ID, p.gudang],
    ] as const) {
      if (qty > 0) {
        opening.push({
          business_id: EVAL_BUSINESS_ID,
          product_id: pid(p.n),
          location_id,
          transaction_type: "masuk",
          quantity: qty,
          notes: "Saldo awal tenant evaluasi",
          created_at: openingAt,
        });
      }
    }
  }

  const latest = now.getTime() - 60 * 60 * 1000;
  const sales: SeedTransaction[] = [];
  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
    const day10 = monthStart(now, monthsAgo).getTime() + 9 * 24 * 60 * 60 * 1000;
    const at = new Date(Math.min(day10, latest)).toISOString();
    for (const p of PRODUCTS) {
      const qty = p.sales[5 - monthsAgo];
      if (qty > 0) {
        sales.push({
          business_id: EVAL_BUSINESS_ID,
          product_id: pid(p.n),
          location_id: EVAL_TOKO_ID,
          transaction_type: "keluar",
          quantity: qty,
          notes: "Riwayat penjualan sintetis (evaluasi)",
          created_at: at,
        });
      }
    }
  }
  return { opening, sales };
}
