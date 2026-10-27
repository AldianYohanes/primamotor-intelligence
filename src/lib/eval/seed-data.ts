/**
 * Isi tenant evaluasi, salinan supabase/seed_eval.sql untuk tombol "Reset data eval"
 * di /eval (route /api/eval/seed). Kalau angka di seed_eval.sql diubah, ubah juga di
 * sini (dan sebaliknya); test seed-data.test.ts memeriksa saldo akhirnya.
 *
 * Nama barang dari catatan observasi lapangan; nomor part, merek, dan kompatibilitas dari riset web terbuka
 * (vault Thesis/01 - Research/volvo-classic-parts-brand-research.csv, 28 Sep 2026, tiap baris punya URL sumber).
 * Kuantitas, harga, dan riwayat penjualan SINTETIS: pemilik toko tidak mengizinkan pengumpulan data, bukan data mitra.
 */

export const EVAL_BUSINESS_ID = "e0000000-0000-0000-0000-00000000e001";
export const EVAL_TOKO_ID = "e0000000-0ca0-0000-0000-000000000001";
export const EVAL_GUDANG_ID = "e0000000-0ca0-0000-0000-000000000002";

export const EVAL_BUSINESS = {
  id: EVAL_BUSINESS_ID,
  name: "Prima Motor Volvo",
  slug: "eval-prima-motor",
  address: "Lantai 3A, Blok M Square, Jakarta Selatan",
  status: "active",
} as const;

export const EVAL_LOCATIONS = [
  { id: EVAL_TOKO_ID, business_id: EVAL_BUSINESS_ID, name: "Toko", type: "toko", latitude: -6.2441, longitude: 106.8 },
  { id: EVAL_GUDANG_ID, business_id: EVAL_BUSINESS_ID, name: "Gudang", type: "gudang", latitude: -6.2665, longitude: 106.804 },
] as const;

const pid = (n: number) => `e0000000-0d0c-0000-0000-${String(n).padStart(12, "0")}`;

export type ProductSeed = {
  n: number;
  /** Nomor part asli dari riset web terbuka. */
  partNumber: string;
  brand: string;
  fit: string;
  source: string;
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
  { n: 1, partNumber: "271747", brand: "Continental", name: "Timing Belt Volvo 240 B230", category: "Sabuk penggerak mesin", unit: "pcs", minThreshold: 3, unitCost: 350000, sellingPrice: 480000, toko: 6, gudang: 14, sales: [2, 3, 2, 4, 3, 2], fit: "Volvo 240/940", source: "https://www.fcpeuro.com/products/volvo-engine-timing-belt-940-240-continental-tb234" },
  { n: 2, partNumber: "981680", brand: "Continental", name: "V-Belt Alternator", category: "Sabuk penggerak mesin", unit: "pcs", minThreshold: 4, unitCost: 90000, sellingPrice: 135000, toko: 8, gudang: 20, sales: [3, 2, 4, 3, 5, 2], fit: "Volvo 940/740/760/780/745", source: "https://www.ebay.com/itm/126374848500" },
  { n: 3, partNumber: "5003505", brand: "Nissens", name: "Radiator Volvo 240", category: "Sistem pendingin", unit: "unit", minThreshold: 1, unitCost: 1800000, sellingPrice: 2450000, toko: 2, gudang: 3, sales: [0, 1, 0, 1, 1, 0], fit: "Volvo 240/260/740/760/780/940, cross-ref 1346015/1378592/5001906/8601007/8601126/8601127", source: "https://www.ipdusa.com/products/7261/Radiator-Volvo-240-260-740-760-780-940-1991-Nissens-5003505-8603894" },
  { n: 4, partNumber: "0 986 424 016", brand: "Bosch", name: "Kampas Rem Depan Bosch", category: "Sistem pengereman", unit: "set", minThreshold: 4, unitCost: 420000, sellingPrice: 590000, toko: 10, gudang: 16, sales: [4, 5, 3, 6, 5, 4], fit: "Volvo 740/760/940/940 II/960/960 II/S90 I/V90 I (1983-1998)", source: "https://www.ebay.com/itm/325727023250" },
  { n: 5, partNumber: "1205825", brand: "Meyle", name: "Bushing Arm Suspensi Depan", category: "Suspensi/karet", unit: "pcs", minThreshold: 6, unitCost: 75000, sellingPrice: 115000, toko: 12, gudang: 30, sales: [6, 4, 8, 5, 7, 3], fit: "Volvo 240/242/244/245/262/264/265", source: "https://www.fcpeuro.com/products/volvo-control-arm-bushing-242-244-245-240-262-264-265-front" },
  { n: 6, partNumber: "31372212", brand: "Mahle", name: "Filter Oli Mahle", category: "Filter", unit: "pcs", minThreshold: 10, unitCost: 65000, sellingPrice: 95000, toko: 25, gudang: 60, sales: [18, 22, 20, 25, 24, 12], fit: "Volvo (general model not specified)", source: "https://www.blauparts.com/volvo-oil-filter-mahle-31372212.html" },
  { n: 7, partNumber: "LX443", brand: "Mahle", name: "Filter Udara Mahle", category: "Filter", unit: "pcs", minThreshold: 5, unitCost: 110000, sellingPrice: 160000, toko: 9, gudang: 15, sales: [5, 6, 4, 7, 6, 3], fit: "Volvo 740/940 non-turbo", source: "https://www.ipdusa.com/products/6267/112442-volvo-engine-air-filter-740-940-non-turbo-mahle-lx443-1336397" },
  { n: 8, partNumber: "43315", brand: "Bosch", name: "Bilah Wiper Bosch 20 inch", category: "Wiper", unit: "pcs", minThreshold: 6, unitCost: 80000, sellingPrice: 125000, toko: 14, gudang: 20, sales: [3, 5, 9, 11, 6, 4], fit: "Volvo 740/745/940/760", source: "https://www.fcpeuro.com/products/volvo-windshield-wiper-blade-refill-740-745-940-760-43315" },
  { n: 9, partNumber: "973487", brand: "Continental", name: "Sabuk Multi-Rib Continental", category: "Sabuk penggerak mesin", unit: "pcs", minThreshold: 3, unitCost: 180000, sellingPrice: 260000, toko: 5, gudang: 7, sales: [1, 2, 1, 2, 2, 1], fit: "Volvo 740/760/780/940", source: "https://www.fcpeuro.com/products/volvo-accessory-drive-belt-740-760-780-940-conti-119x1013" },
  { n: 10, partNumber: "8602017", brand: "ATE", name: "Master Rem ATE", category: "Sistem pengereman", unit: "unit", minThreshold: 1, unitCost: 1100000, sellingPrice: 1500000, toko: 4, gudang: 12, sales: [2, 1, 2, 2, 1, 1], fit: "Volvo 740/760/780/940", source: "https://www.fcpeuro.com/products/volvo-brake-master-cylinder-with-abs-740-760-780-940" },
  { n: 11, partNumber: "14775", brand: "febi bilstein", name: "Tutup Tangki Air Radiator Febi", category: "Sistem pendingin", unit: "pcs", minThreshold: 2, unitCost: 85000, sellingPrice: 130000, toko: 1, gudang: 2, sales: [1, 0, 1, 0, 1, 0], fit: "Volvo 740/760/850/940/960 (per Amazon listing; cross-ref 1330147/1357390/1357775/30864125)", source: "https://www.autohausaz.com/pn/9445462" },
  { n: 12, partNumber: "1372441", brand: "Aftermarket (merek tidak disebut)", name: "Lampu Belakang Kiri Volvo 240 Wagon", category: "Kelistrikan/pencahayaan", unit: "unit", minThreshold: 1, unitCost: 550000, sellingPrice: 760000, toko: 0, gudang: 4, sales: [0, 1, 0, 0, 1, 0], fit: "Volvo 240 wagon", source: "https://www.ipdusa.com/products/6784/Left-Tail-lamp-Assembly-240-Wagon-Aftermarket-Volvo-1372441" },
  { n: 13, partNumber: "6819033", brand: "Genuine Volvo (OEM)", name: "Kabel Rem Tangan Volvo 940", category: "Sistem pengereman", unit: "pcs", minThreshold: 1, unitCost: 250000, sellingPrice: 360000, toko: 3, gudang: 5, sales: [1, 0, 1, 1, 0, 1], fit: "Volvo 940 SE", source: "https://usparts.volvocars.com/p/Volvo__940-SE/Parking-Brake-Cable-Right/42793969/6819033.html" },
  { n: 14, partNumber: "3518885", brand: "OEM/generic reproduction", name: "Gril Depan Volvo 740/940", category: "Bodi/eksterior", unit: "unit", minThreshold: 1, unitCost: 1200000, sellingPrice: 1650000, toko: 1, gudang: 0, sales: [0, 0, 1, 0, 0, 0], fit: "Volvo 740/940 1989-1995", source: "https://www.ebay.com/itm/265879416472" },
  { n: 15, partNumber: "9134332", brand: "Genuine Volvo (OEM)", name: "Mud Flap Belakang", category: "Bodi/eksterior", unit: "pasang", minThreshold: 2, unitCost: 150000, sellingPrice: 220000, toko: 6, gudang: 10, sales: [1, 2, 1, 1, 2, 1], fit: "Volvo 740/760/940 (5-door only)/960 (5-door only)", source: "https://classic-volvo.com/catalog/product/view/id/64883/category/2999/" },
  { n: 16, partNumber: "1372442", brand: "Professional Parts Sweden", name: "Stoplamp Volvo 240 Wagon", category: "Kelistrikan/pencahayaan", unit: "unit", minThreshold: 1, unitCost: 600000, sellingPrice: 840000, toko: 2, gudang: 2, sales: [0, 1, 0, 0, 0, 1], fit: "Volvo 240/244/245 wagons", source: "https://www.fcpeuro.com/products/volvo-tail-light-assembly-right-240-244-245-wagons" },
  { n: 17, partNumber: "69593", brand: "Bosch", name: "Pompa Bensin Bosch Volvo 240", category: "Bahan bakar", unit: "unit", minThreshold: 1, unitCost: 650000, sellingPrice: 910000, toko: 1, gudang: 1, sales: [0, 0, 0, 1, 0, 0], fit: "Volvo 940/960/240/740 (non-turbo)", source: "https://www.ebay.com/itm/364585055203" },
  { n: 18, partNumber: "BPR6ES", brand: "NGK", name: "Busi NGK Copper", category: "Pengapian", unit: "pcs", minThreshold: 12, unitCost: 28000, sellingPrice: 45000, toko: 30, gudang: 80, sales: [14, 18, 16, 20, 19, 10], fit: "Volvo 240/940/244/245/740/242/760/780/745, 1988+ B200/B230 engines", source: "https://vp-autoparts.com/en/artiklar/spark-plug-kit-240-740-940-88-.html" },
  { n: 19, partNumber: "6714088", brand: "Denso", name: "Kabel Busi Denso", category: "Pengapian", unit: "set", minThreshold: 2, unitCost: 220000, sellingPrice: 310000, toko: 3, gudang: 5, sales: [1, 2, 1, 1, 2, 1], fit: "Volvo 740/940", source: "https://www.ipdusa.com/products/8434/Spark-Plug-Wire-Set-740-940-for-Volvo-Denso-6714088-271483-110548" },
  { n: 20, partNumber: "MA-3715368290", brand: "Mizumo Auto", name: "Water Pump Mizumo", category: "Sistem pendingin", unit: "unit", minThreshold: 2, unitCost: 480000, sellingPrice: 680000, toko: 4, gudang: 6, sales: [1, 2, 1, 2, 1, 1], fit: "Volvo 940/740/240/244/245/760/780/745 (1985)", source: "https://mizumoauto.com/products/mizumo-auto-ma-3715368290-water-pump-fits-volvo-940-740-240-244-245-760-780-745-1985" },
  { n: 21, partNumber: "408971D", brand: "Wahler", name: "Termostat Wahler", category: "Sistem pendingin", unit: "pcs", minThreshold: 3, unitCost: 130000, sellingPrice: 195000, toko: 5, gudang: 9, sales: [2, 1, 3, 2, 2, 1], fit: "Volvo 240/740/760/780/940", source: "https://www.fcpeuro.com/products/volvo-engine-coolant-thermostat-240-740-760-780-940-71" },
  { n: 22, partNumber: "19-019888", brand: "Bilstein", name: "Shock Absorber Belakang Bilstein", category: "Suspensi/karet", unit: "pcs", minThreshold: 2, unitCost: 850000, sellingPrice: 1180000, toko: 4, gudang: 6, sales: [1, 1, 2, 1, 2, 1], fit: "Volvo 740/760/780/940/960", source: "https://www.shockwarehouse.com/products/bilstein-19-019888-rear-b4-oe-replacement-bilstein-touring-class-shock-absorber-volvo-740-760-780-940-960" },
  { n: 23, partNumber: "4095811", brand: "Lesjofors", name: "Per Keong Depan Lesjofors", category: "Suspensi/karet", unit: "pcs", minThreshold: 2, unitCost: 420000, sellingPrice: 590000, toko: 3, gudang: 4, sales: [1, 0, 1, 1, 1, 0], fit: "Volvo 740/745/760/940", source: "https://www.ebay.com/itm/274201358895" },
  { n: 24, partNumber: "3000449001", brand: "Sachs", name: "Kopling Kit Sachs", category: "Transmisi", unit: "set", minThreshold: 1, unitCost: 1900000, sellingPrice: 2650000, toko: 2, gudang: 2, sales: [0, 1, 0, 1, 0, 1], fit: "Volvo 740/940", source: "https://www.amcarparts.co.uk/sachs/235679-sachs-clutch-kit-3000449001-for-volvo-740-940-4013872098491" },
  { n: 25, partNumber: "WKH733", brand: "SKF", name: "Bearing Roda Belakang SKF", category: "Suspensi/karet", unit: "set", minThreshold: 3, unitCost: 310000, sellingPrice: 440000, toko: 6, gudang: 8, sales: [2, 3, 2, 2, 3, 1], fit: "Volvo 740/760/780/940/960", source: "https://www.fcpeuro.com/products/volvo-wheel-bearing-kit-rear-740-760-780-940-960-271262" },
  { n: 26, partNumber: "022584008", brand: "Victor Reinz", name: "Gasket Kepala Silinder Victor Reinz", category: "Mesin", unit: "set", minThreshold: 2, unitCost: 650000, sellingPrice: 910000, toko: 3, gudang: 3, sales: [1, 0, 1, 1, 0, 1], fit: "Volvo 270689 (B230 engine)", source: "https://www.ipdusa.com/products/23843/B230-Head-Gasket-Set-Complete-Victor-Reinz-022584008-Volvo-270689" },
  { n: 27, partNumber: "538599KT1", brand: "Corteco", name: "Engine Mount Corteco", category: "Mesin", unit: "pcs", minThreshold: 2, unitCost: 360000, sellingPrice: 510000, toko: 4, gudang: 5, sales: [1, 2, 1, 1, 2, 1], fit: "Volvo (model not detailed in listing)", source: "https://www.fcpeuro.com/products/volvo-engine-mount-kit-corteco-538599kt1" },
  { n: 28, partNumber: "18349", brand: "Walker", name: "Knalpot Walker", category: "Knalpot", unit: "unit", minThreshold: 1, unitCost: 1100000, sellingPrice: 1550000, toko: 2, gudang: 3, sales: [0, 1, 1, 0, 1, 0], fit: "Volvo 940", source: "https://www.amazon.com/Walker-18349-SoundFX-Muffler/dp/B000C9475S" },
  { n: 29, partNumber: "3514629", brand: "Genuine Volvo (OEM)", name: "Selang Radiator Atas Volvo", category: "Sistem pendingin", unit: "pcs", minThreshold: 2, unitCost: 180000, sellingPrice: 260000, toko: 12, gudang: 24, sales: [6, 8, 7, 9, 8, 5], fit: "Volvo 740 (1985-1991 turbo)", source: "https://www.ebay.com/itm/124438682805" },
  { n: 30, partNumber: "9447755", brand: "Genuine Volvo (OEM)", name: "Kaca Spion Kiri OEM", category: "Bodi/eksterior", unit: "pcs", minThreshold: 2, unitCost: 320000, sellingPrice: 450000, toko: 3, gudang: 4, sales: [1, 1, 0, 1, 1, 0], fit: "Volvo 240/740/760/940/960/S90/V90", source: "https://www.ipdusa.com/products/14307/835/1992-Volvo-240-DOOR-MIRROR-GLASS-LEFT-Genuine-Volvo-9447755" },
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
  [12, "tail lamp kiri"],
  [12, "stop kiri"],
  [14, "grill"],
  [15, "pelindung lumpur"],
  [1, "cambelt"],
  [1, "cam belt"],
  [2, "fan belt"],
  [2, "tali kipas"],
  [2, "fanbelt"],
  [8, "wiper blade"],
  [9, "drive belt"],
  [9, "serpentine belt"],
  [14, "grille"],
  [15, "kepet"],
  [15, "kepet spakbor"],
  [15, "mudflap"],
  [16, "stop lamp"],
  [16, "lampu rem"],
  [18, "spark plug"],
  [20, "pompa air"],
  [21, "thermostat"],
  [22, "sokbreker"],
  [23, "coil spring"],
  [25, "wheel bearing"],
  [26, "head gasket"],
  [28, "muffler"],
  [18, "bougie"],
  [20, "waterpump"],
  [22, "sokbreaker"],
  [22, "shockbreaker"],
  [22, "shock breaker"],
  [23, "pegas ulir"],
  [24, "plat kopling"],
  [24, "matahari kopling"],
  [25, "laher roda"],
  [26, "paking"],
  [26, "gasket silinder head"],
  [27, "engine mounting"],
  [27, "dudukan mesin"],
  [28, "silencer"],
  [30, "spion"],
  [10, "master rem"],
  [10, "master silinder rem"],
  [10, "brake master"],
  [10, "master cylinder rem"],
  [11, "tutup radiator"],
  [11, "radiator cap"],
  [11, "tutup tangki"],
  [11, "tutup tabung radiator"],
  [13, "kabel handbrake"],
  [13, "kabel rem parkir"],
  [13, "parking brake cable"],
  [13, "kabel rem tangan"],
  [17, "fuel pump"],
  [17, "pompa bahan bakar"],
  [17, "pompa bensin elektrik"],
  [17, "pompa bensin"],
  [29, "selang radiator"],
  [29, "radiator hose"],
  [29, "selang atas"],
];

/** Data dasar tiap barang, dipakai juga oleh seed-activity.ts. */
export const EVAL_PRODUCT_SEEDS = PRODUCTS;

export const EVAL_PRODUCTS = PRODUCTS.map((p) => ({
  id: pid(p.n),
  business_id: EVAL_BUSINESS_ID,
  part_number: p.partNumber,
  name: p.name,
  category: p.category,
  unit: p.unit,
  min_threshold: p.minThreshold,
  unit_cost: p.unitCost,
  selling_price: p.sellingPrice,
  description: `${p.brand}. Kompatibel: ${p.fit}. Nomor part dari riset web terbuka: ${p.source}`,
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
          notes: "Saldo awal",
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
          notes: "Riwayat penjualan awal (simulasi)",
          created_at: at,
        });
      }
    }
  }
  return { opening, sales };
}
