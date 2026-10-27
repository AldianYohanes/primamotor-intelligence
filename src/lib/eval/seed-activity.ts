/**
 * Data simulasi aktivitas toko untuk tombol "Reset data eval": penjualan POS, shift kasir, pelanggan
 * dan piutang, klaim garansi, pemasok, pembelian, transfer gudang ke toko, stock opname, impor nota,
 * saran pemesanan ulang, dan notifikasi. Semua SINTETIS (pemilik toko tidak mengizinkan pengumpulan
 * data); hanya nomor part, merek, dan kompatibilitas yang berasal dari dataset suku cadang Volvo asli.
 *
 * Tidak ada riwayat agent (percakapan, audit, metrik): itu terisi sendiri dari chat dan run /eval.
 *
 * Aturan yang dijaga (diuji di seed-activity.test.ts):
 * - Saldo akhir tiap barang di Toko dan Gudang sama dengan seed dasar (seed-data.ts).
 * - Penjualan keluar per bulan = angka seed dasar x VOLUME, jadi bentuk tren penjualan tetap.
 * - Saldo berjalan tidak pernah minus, karena ledger masuk ke tabel stock lewat trigger per baris.
 */
import { calculateReorder, shouldCreateReorderSuggestion } from "@/src/lib/inventory/reorder-calculation";
import {
  EVAL_BUSINESS_ID,
  EVAL_GUDANG_ID,
  EVAL_PRODUCTS,
  EVAL_PRODUCT_SEEDS,
  EVAL_TOKO_ID,
  type ProductSeed,
} from "@/src/lib/eval/seed-data";

export const VOLUME = 3;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type ActivityStaff = { owner: string; warehouse: string; cashiers: string[] };

const uid = (kind: string, n: number) => `e0000000-${kind}-0000-0000-${String(n).padStart(12, "0")}`;
const pid = (n: number) => `e0000000-0d0c-0000-0000-${String(n).padStart(12, "0")}`;
const iso = (ms: number) => new Date(ms).toISOString();

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Master data ----------

export const EVAL_SUPPLIERS = [
  { name: "CV Eropa Auto Part", contact_person: "Pak Darmawan", phone: "0812-0000-0101", address: "Jl. Mangga Besar Raya, Jakarta Barat", leadTime: 5, brands: ["Continental", "Mahle", "febi bilstein", "Victor Reinz", "Corteco"] },
  { name: "PT Mitra Rem dan Suspensi", contact_person: "Bu Linda", phone: "0812-0000-0102", address: "Jl. Gunung Sahari, Jakarta Pusat", leadTime: 7, brands: ["ATE", "Meyle", "Lesjofors", "Bilstein", "SKF", "Sachs"] },
  { name: "UD Volvo Klasik Sparepart", contact_person: "Koh Andi", phone: "0812-0000-0103", address: "Jl. Pasar Pagi, Jakarta Barat", leadTime: 10, brands: ["Genuine Volvo (OEM)", "OEM/generic reproduction", "Aftermarket (merek tidak disebut)", "Professional Parts Sweden", "Mizumo Auto"] },
  { name: "Toko Filter dan Pengapian Jaya", contact_person: "Pak Rudi", phone: "0812-0000-0104", address: "Jl. Kramat Raya, Jakarta Pusat", leadTime: 3, brands: ["Bosch", "NGK", "Denso", "Walker", "Wahler", "Nissens"] },
] as const;

const supplierIndexOf = (brand: string) => {
  const i = EVAL_SUPPLIERS.findIndex((s) => (s.brands as readonly string[]).includes(brand));
  return i < 0 ? 0 : i;
};

const WARRANTY_DAYS: Record<string, number> = {
  "Sistem pengereman": 90,
  "Suspensi/karet": 180,
  "Kelistrikan/pencahayaan": 90,
  "Bahan bakar": 90,
  Pengapian: 30,
  Mesin: 90,
  "Sistem pendingin": 90,
  Transmisi: 180,
};

/** Kolom tambahan produk (pemasok utama, lead time, stok pengaman, garansi) untuk insert products. */
export function productExtras(p: ProductSeed) {
  const s = supplierIndexOf(p.brand);
  return {
    supplierIndex: s,
    lead_time_days: EVAL_SUPPLIERS[s].leadTime,
    safety_stock: Math.max(1, Math.round(p.minThreshold / 2)),
    warranty_days: WARRANTY_DAYS[p.category] ?? null,
  };
}

export const supplierId = (index: number) => uid("5a01", index + 1);

/** Baris products lengkap (seed dasar + pemasok utama, lead time, stok pengaman, garansi). */
export const EVAL_PRODUCT_ROWS = EVAL_PRODUCTS.map((row, k) => {
  const { supplierIndex, ...extras } = productExtras(EVAL_PRODUCT_SEEDS[k]);
  return { ...row, preferred_supplier_id: supplierId(supplierIndex), ...extras };
});

/** Akun staf tambahan (login tetap; PIN dari SEED_STAFF_PIN, tidak ditulis di repo). */
export const EVAL_EXTRA_STAFF = [
  { username: "kasir1", full_name: "Kasir Toko 1", kind: "cashier", salary: 4_000_000 },
  { username: "kasir2", full_name: "Kasir Toko 2", kind: "cashier", salary: 4_000_000 },
  { username: "gudang1", full_name: "Staf Gudang", kind: "warehouse", salary: 4_200_000 },
] as const;

/** Dua toko contoh untuk halaman admin tenant (tanpa staf). */
export const EVAL_EXAMPLE_BUSINESSES = [
  { id: uid("5a10", 1), name: "Bengkel Sinar Otomotif", slug: "contoh-menunggu-verifikasi", address: "Jl. Fatmawati Raya, Jakarta Selatan", status: "pending_verification" },
  { id: uid("5a10", 2), name: "Toko Suku Cadang Mega", slug: "contoh-ditolak", address: "Jl. Raya Bogor, Jakarta Timur", status: "rejected" },
] as const;

const CAR_MODELS = [
  { name: "240", re: /\b24\d\b/, era_group: "Seri 200" },
  { name: "260", re: /\b26\d\b/, era_group: "Seri 200" },
  { name: "740", re: /\b74\d\b/, era_group: "Seri 700" },
  { name: "760", re: /\b760\b/, era_group: "Seri 700" },
  { name: "780", re: /\b780\b/, era_group: "Seri 700" },
  { name: "850", re: /\b850\b/, era_group: "Seri 800" },
  { name: "940", re: /\b94\d\b/, era_group: "Seri 900" },
  { name: "960", re: /\b960\b/, era_group: "Seri 900" },
  { name: "S90", re: /\bS90\b/, era_group: "Seri 90" },
  { name: "V90", re: /\bV90\b/, era_group: "Seri 90" },
];

/** Model mobil global (tanpa tahun, karena sumber dataset tidak memuatnya) dan kompatibilitas hasil membaca teks `fit` dataset. */
export const EVAL_CAR_MODELS = CAR_MODELS.map(({ name, era_group }) => ({ brand: "Volvo", name, era_group }));
export const EVAL_COMPATIBILITY = EVAL_PRODUCT_SEEDS.flatMap((p) =>
  CAR_MODELS.filter((m) => m.re.test(p.fit)).map((m) => ({ product_id: pid(p.n), model_name: m.name })),
);

const CUSTOMERS = [
  { name: "Bengkel Maju Jaya", phone: "0812-0000-0201", credit: 15_000_000 },
  { name: "Bengkel Setia Motor", phone: "0812-0000-0202", credit: 10_000_000 },
  { name: "Bengkel Euro Garage", phone: "0812-0000-0203", credit: 20_000_000 },
  { name: "Volvo Club Jakarta (anggota)", phone: "0812-0000-0204", credit: 5_000_000 },
  { name: "Pak Hendra", phone: "0812-0000-0205", credit: 5_000_000 },
  { name: "Bu Sari", phone: "0812-0000-0206", credit: 0 },
  { name: "Pak Wibowo", phone: "0812-0000-0207", credit: 0 },
  { name: "Rizky", phone: "0812-0000-0208", credit: 0 },
  { name: "Bengkel Prima Otomotif", phone: "0812-0000-0209", credit: 12_000_000 },
  { name: "Ibu Maya", phone: "0812-0000-0210", credit: 0 },
];

// ---------- Generator ----------

type Tx = {
  id: string;
  product: number;
  loc: string;
  type: "masuk" | "keluar" | "transfer_out" | "transfer_in" | "retur" | "adjustment_in" | "adjustment_out";
  qty: number;
  price: number | null;
  supplier: string | null;
  staff: string;
  notes: string;
  at: number;
  related?: string;
};
type Line = { p: ProductSeed; qty: number; txId: string; itemId?: string };
type SaleDraft = { lines: Line[]; at: number; month: number; id?: string; number?: string };

const RANK: Record<Tx["type"], number> = { masuk: 0, transfer_out: 1, transfer_in: 2, keluar: 3, retur: 4, adjustment_in: 5, adjustment_out: 5 };

export function buildSeedActivity(now: Date, staff: ActivityStaff) {
  const rand = mulberry32(20261027);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const nowMs = now.getTime();
  const latest = nowMs - HOUR;
  const monthStart = (ago: number) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - ago, 1);
  const P = EVAL_PRODUCT_SEEDS;
  const byN = new Map(P.map((p) => [p.n, p]));
  const toko = EVAL_TOKO_ID;
  const gudang = EVAL_GUDANG_ID;

  let ledgerSeq = 0;
  const ledger: (Tx & { seq: number })[] = [];
  const addTx = (t: Omit<Tx, "id"> & { id?: string }) => {
    const id = t.id ?? uid("5a05", ++ledgerSeq);
    ledger.push({ ...t, id, seq: ledgerSeq });
    return id;
  };

  // 1. Baris penjualan per bulan (index 0 = 5 bulan lalu), dibagi 1-3 unit per baris.
  const monthLines: Line[][] = [];
  let lineSeq = 0;
  for (let i = 0; i < 6; i++) {
    const lines: Line[] = [];
    for (const p of P) {
      let rem = p.sales[i] * VOLUME;
      while (rem > 0) {
        const qty = 1 + Math.floor(rand() * Math.min(rem, 3));
        lines.push({ p, qty, txId: uid("5a15", ++lineSeq) });
        rem -= qty;
      }
    }
    monthLines.push(lines);
  }

  // 2. Kelompokkan baris jadi nota (1-3 barang berbeda) dan beri waktu jam kerja.
  const drafts: SaleDraft[] = [];
  monthLines.forEach((lines, i) => {
    const pool = [...lines].sort(() => rand() - 0.5);
    const lo = monthStart(5 - i) + 2 * HOUR;
    const hi = Math.min(monthStart(4 - i) - HOUR, latest);
    while (pool.length) {
      const size = Math.min(pool.length, 1 + Math.floor(rand() * rand() * 3.2));
      const group: Line[] = [];
      for (let k = 0; k < pool.length && group.length < size; k++) {
        if (!group.some((g) => g.p.n === pool[k].p.n)) group.push(...pool.splice(k--, 1));
      }
      const day = Math.floor((lo + rand() * Math.max(hi - lo, 0)) / DAY);
      let at = day * DAY + 2 * HOUR + Math.floor(rand() * 11.5 * HOUR);
      while (at > latest) at -= DAY;
      drafts.push({ lines: group, at: Math.max(at, lo), month: i });
    }
  });
  drafts.sort((a, b) => a.at - b.at);

  // 3. Void dan klaim garansi: satu retur per barang per bulan, hanya bila stok akhir Toko cukup.
  const returKey = new Set<string>();
  const canRetur = (l: Line, month: number) => !returKey.has(`${l.p.n}|${month}`) && l.p.toko >= l.qty;
  const voidAt = new Map<SaleDraft, number>();
  for (const d of drafts) {
    const end = monthStart(4 - d.month);
    const when = d.at + (1 + Math.floor(rand() * 2)) * HOUR;
    if (voidAt.size >= 8 || rand() > 0.02 || when > latest || when >= end || d.at > latest - 2 * DAY) continue;
    if (!d.lines.every((l) => canRetur(l, d.month))) continue;
    d.lines.forEach((l) => returKey.add(`${l.p.n}|${d.month}`));
    voidAt.set(d, when);
  }
  type Claim = { draft: SaleDraft; line: Line; resolution: "repaired" | "replaced" | "refunded"; at: number; reason: string };
  const claims: Claim[] = [];
  const REASONS = ["Barang tidak pas saat dipasang", "Rusak sebelum waktunya", "Bocor setelah dipakai", "Bunyi kasar setelah pemasangan"];
  const RESOLUTIONS: Claim["resolution"][] = ["repaired", "replaced", "refunded", "repaired", "repaired", "replaced"];
  for (const d of [...drafts].reverse()) {
    if (claims.length >= RESOLUTIONS.length || voidAt.has(d) || d.at > latest - 8 * DAY || d.at < nowMs - 80 * DAY) continue;
    const line = d.lines.find((l) => productExtras(l.p).warranty_days && productExtras(l.p).warranty_days! >= 90);
    if (!line || rand() > 0.12) continue;
    const resolution = RESOLUTIONS[claims.length];
    const at = d.at + (3 + Math.floor(rand() * 5)) * DAY;
    if (at > latest || at >= monthStart(4 - d.month)) continue;
    if (resolution !== "repaired") {
      if (!canRetur(line, d.month)) continue;
      returKey.add(`${line.p.n}|${d.month}`);
    }
    claims.push({ draft: d, line, resolution, at, reason: pick(REASONS) });
  }

  // 4. Nomor nota, staf per hari, pembayaran.
  const cashierOf = (ms: number) => staff.cashiers[Math.floor(ms / DAY) % staff.cashiers.length];
  const saleRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const payRows: Record<string, unknown>[] = [];
  const counters = new Map<number, number>();
  const piutangByCustomer = new Map<number, number>();
  const creditCustomers = CUSTOMERS.map((c, i) => ({ ...c, i })).filter((c) => c.credit > 0);
  const saleMeta: { id: string; at: number; staff: string; status: string; method: string; cash: number }[] = [];
  let itemSeq = 0;
  let paySeq = 0;
  drafts.forEach((d, idx) => {
    const year = new Date(d.at).getUTCFullYear();
    const counter = (counters.get(year) ?? 0) + 1;
    counters.set(year, counter);
    const number = `INV/${year}/${String(counter).padStart(6, "0")}`;
    const id = uid("5a03", idx + 1);
    const cashier = cashierOf(d.at);
    const subtotal = d.lines.reduce((a, l) => a + l.p.sellingPrice * l.qty, 0);
    const discount = rand() < 0.12 ? 5000 * (1 + Math.floor(rand() * 3)) : 0;
    const total = subtotal - discount;
    const isVoid = voidAt.has(d);

    const r = rand();
    let method = r < 0.45 ? "cash" : r < 0.65 ? "transfer" : r < 0.9 ? "qris" : r < 0.95 ? "card" : r < 0.98 ? "split" : "piutang";
    let customerIdx: number | null = rand() < 0.2 ? Math.floor(rand() * CUSTOMERS.length) : null;
    if (method === "piutang") {
      const eligible = creditCustomers.filter((c) => (piutangByCustomer.get(c.i) ?? 0) + total <= c.credit * 0.7);
      if (!eligible.length || isVoid) method = "transfer";
      else {
        customerIdx = pick(eligible).i;
        piutangByCustomer.set(customerIdx, (piutangByCustomer.get(customerIdx) ?? 0) + total);
      }
    }
    const payments: { method: string; amount: number }[] = [];
    let paid = 0;
    if (method === "cash") {
      paid = rand() < 0.5 ? total : Math.ceil(total / 50_000) * 50_000;
      payments.push({ method, amount: paid });
    } else if (method === "split") {
      const first = Math.round((total * (0.3 + rand() * 0.4)) / 1000) * 1000;
      payments.push({ method: "cash", amount: first }, { method: pick(["qris", "transfer"]), amount: total - first });
      paid = total;
    } else if (method !== "piutang") {
      payments.push({ method, amount: total });
      paid = total;
    }
    // kas masuk laci = uang tunai yang diserahkan dikurangi kembalian (sama dengan laporan shift)
    const cashPaid = payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0) - (method === "cash" ? paid - total : 0);
    const customer = customerIdx === null ? null : CUSTOMERS[customerIdx];

    saleRows.push({
      id,
      business_id: EVAL_BUSINESS_ID,
      location_id: toko,
      staff_id: cashier,
      customer_id: customerIdx === null ? null : uid("5a02", customerIdx + 1),
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
      subtotal,
      discount_amount: discount,
      tax_amount: 0,
      total_amount: total,
      payment_method: method,
      amount_paid: method === "piutang" ? 0 : paid,
      change_amount: method === "cash" ? paid - total : 0,
      status: isVoid ? "voided" : "completed",
      voided_by: isVoid ? staff.owner : null,
      voided_at: isVoid ? iso(voidAt.get(d)!) : null,
      void_reason: isVoid ? "Salah input barang" : null,
      notes: null,
      sale_number: number,
      created_at: iso(d.at),
    });
    for (const l of d.lines) {
      const itemId = uid("5a04", ++itemSeq);
      addTx({ id: l.txId, product: l.p.n, loc: toko, type: "keluar", qty: l.qty, price: l.p.sellingPrice, supplier: null, staff: cashier, notes: `Penjualan POS ${number}`, at: d.at });
      itemRows.push({
        id: itemId,
        sale_id: id,
        business_id: EVAL_BUSINESS_ID,
        product_id: pid(l.p.n),
        quantity: l.qty,
        unit_price: l.p.sellingPrice,
        discount_amount: 0,
        subtotal: l.p.sellingPrice * l.qty,
        stock_transaction_id: l.txId,
        created_at: iso(d.at),
      });
      l.itemId = itemId;
      if (isVoid) {
        addTx({ product: l.p.n, loc: toko, type: "retur", qty: l.qty, price: l.p.sellingPrice, supplier: null, staff: staff.owner, notes: `Void nota ${number}: Salah input barang`, at: voidAt.get(d)!, related: l.txId });
      }
    }
    for (const p of payments) {
      payRows.push({ id: uid("5a06", ++paySeq), sale_id: id, business_id: EVAL_BUSINESS_ID, payment_method: p.method, amount: p.amount, created_at: iso(d.at) });
    }
    saleMeta.push({ id, at: d.at, staff: cashier, status: isVoid ? "voided" : "completed", method, cash: cashPaid });
    d.number = number;
    d.id = id;
  });

  const claimRows = claims.map((c, i) => {
    const number = c.draft.number;
    if (c.resolution !== "repaired") {
      addTx({ product: c.line.p.n, loc: toko, type: "retur", qty: c.line.qty, price: c.line.p.sellingPrice, supplier: null, staff: staff.owner, notes: `Klaim garansi nota ${number}: ${c.reason}`, at: c.at, related: c.line.txId });
    }
    return {
      id: uid("5a0e", i + 1),
      sale_item_id: c.line.itemId,
      business_id: EVAL_BUSINESS_ID,
      staff_id: staff.owner,
      reason: c.reason,
      resolution: c.resolution,
      notes: null,
      created_at: iso(c.at),
    };
  });

  // 5. Transfer Gudang ke Toko tiap awal bulan (bersih dari retur bulan itu) dan pembelian dari pemasok.
  const net: number[][] = P.map(() => [0, 0, 0, 0, 0, 0]);
  const idxOf = new Map(P.map((p, k) => [p.n, k]));
  for (const l of ledger) {
    const month = [0, 1, 2, 3, 4, 5].find((i) => l.at >= monthStart(5 - i) && l.at < monthStart(4 - i));
    if (month === undefined) continue;
    if (l.type === "keluar") net[idxOf.get(l.product)!][month] += l.qty;
    if (l.type === "retur") net[idxOf.get(l.product)!][month] -= l.qty;
  }
  const purchaseTxByGroup = new Map<string, { txId: string; p: ProductSeed; qty: number }[]>();
  const openingAt = monthStart(6);
  P.forEach((p, k) => {
    const remaining = (i: number) => net[k].slice(i).reduce((a, b) => a + b, 0);
    for (let i = 0; i < 6; i++) {
      if (net[k][i] <= 0) continue;
      const at = monthStart(5 - i) + 5 * 60_000;
      const out = addTx({ product: p.n, loc: gudang, type: "transfer_out", qty: net[k][i], price: null, supplier: null, staff: staff.warehouse, notes: "Isi ulang Toko dari Gudang", at });
      addTx({ product: p.n, loc: toko, type: "transfer_in", qty: net[k][i], price: null, supplier: null, staff: staff.warehouse, notes: "Isi ulang Toko dari Gudang", at, related: out });
    }
    const total = remaining(0);
    const target = Math.floor(total / 2);
    let after = 0;
    const s = supplierIndexOf(p.brand);
    for (const i of [4, 2, 0]) {
      const qty = Math.min(Math.ceil(target / 3), Math.max(0, remaining(i + 1) - after), target - after);
      if (qty <= 0) continue;
      after += qty;
      const at = monthStart(5 - i) + (5 + s) * DAY + 3 * HOUR;
      const txId = addTx({ product: p.n, loc: gudang, type: "masuk", qty, price: p.unitCost, supplier: supplierId(s), staff: staff.warehouse, notes: `Pembelian dari ${EVAL_SUPPLIERS[s].name}`, at });
      const key = `${s}|${i}`;
      purchaseTxByGroup.set(key, [...(purchaseTxByGroup.get(key) ?? []), { txId, p, qty }]);
    }
    if (p.toko > 0) addTx({ product: p.n, loc: toko, type: "masuk", qty: p.toko, price: null, supplier: null, staff: staff.owner, notes: "Saldo awal", at: openingAt });
    const gOpen = p.gudang + total - after;
    if (gOpen > 0) addTx({ product: p.n, loc: gudang, type: "masuk", qty: gOpen, price: null, supplier: null, staff: staff.owner, notes: "Saldo awal", at: openingAt });
  });

  // 6. Stock opname: selisih kecil. Saldo sebelum tanggal opname digeser supaya saldo akhir tetap sama.
  const order = (a: Tx & { seq: number }, b: Tx & { seq: number }) => a.at - b.at || RANK[a.type] - RANK[b.type] || a.seq - b.seq;
  ledger.sort(order);
  const signed = (t: Tx) => (["masuk", "transfer_in", "retur", "adjustment_in"].includes(t.type) ? t.qty : -t.qty);
  const history = (n: number, loc: string, before: number) => {
    let bal = 0;
    let min = Infinity;
    for (const t of ledger) {
      if (t.product !== n || t.loc !== loc || t.at >= before) continue;
      bal += signed(t);
      min = Math.min(min, bal);
    }
    return { bal, min };
  };
  const opnameRows: Record<string, unknown>[] = [];
  const OPNAME_PLAN: [number, number, number, string][] = [
    [3, 6, 0, toko], [3, 18, 1, gudang], [3, 5, 2, toko],
    [2, 29, 3, gudang], [2, 8, 4, toko], [2, 4, 5, toko],
    [1, 7, 6, toko], [1, 21, 7, gudang], [1, 25, 8, toko], [1, 22, 9, gudang],
  ];
  const DELTAS = [0, -1, 1, -2, 0, -1, 1, 0, -1, 2];
  OPNAME_PLAN.forEach(([ago, n, di, loc], k) => {
    const at = monthStart(ago) + 24 * DAY + 3 * HOUR;
    if (at > latest) return;
    const { bal, min } = history(n, loc, at);
    let delta = DELTAS[di];
    if (delta > 0 && min < delta) delta = -1;
    const open = ledger.find((t) => t.product === n && t.loc === loc && t.notes === "Saldo awal" && t.at === openingAt);
    if (delta !== 0 && open) {
      open.qty -= delta;
      if (open.qty <= 0) ledger.splice(ledger.indexOf(open), 1);
    } else if (delta !== 0) {
      delta = 0;
    }
    if (delta !== 0) {
      addTx({ product: n, loc, type: delta > 0 ? "adjustment_in" : "adjustment_out", qty: Math.abs(delta), price: null, supplier: null, staff: staff.owner, notes: "Penyesuaian hasil stock opname", at: at + 60_000 });
    }
    opnameRows.push({
      id: uid("5a08", k + 1),
      business_id: EVAL_BUSINESS_ID,
      product_id: pid(n),
      location_id: loc,
      system_quantity: bal - delta,
      counted_quantity: bal,
      staff_id: staff.owner,
      notes: delta === 0 ? "Sesuai" : delta < 0 ? "Barang kurang dari catatan" : "Barang lebih dari catatan",
      opname_date: iso(at).slice(0, 10),
      created_at: iso(at),
    });
  });
  ledger.sort(order);

  // 7. Pelanggan dan pembayaran piutang.
  const owed = new Map<number, number>();
  for (const s of saleRows) {
    if (s.payment_method === "piutang" && s.status === "completed") {
      const i = Number(String(s.customer_id).slice(-12)) - 1;
      owed.set(i, (owed.get(i) ?? 0) + (s.total_amount as number));
    }
  }
  const customerPaymentRows: Record<string, unknown>[] = [];
  const customerRows = CUSTOMERS.map((c, i) => {
    let balance = owed.get(i) ?? 0;
    if (balance > 0) {
      const part = Math.round((balance * 0.5) / 10_000) * 10_000;
      if (part > 0) {
        customerPaymentRows.push({
          id: uid("5a0d", customerPaymentRows.length + 1),
          customer_id: uid("5a02", i + 1),
          business_id: EVAL_BUSINESS_ID,
          staff_id: staff.owner,
          amount: part,
          payment_method: pick(["transfer", "cash"]),
          notes: "Cicilan piutang",
          created_at: iso(latest - (3 + Math.floor(rand() * 20)) * DAY),
        });
        balance -= part;
      }
    }
    return { id: uid("5a02", i + 1), business_id: EVAL_BUSINESS_ID, name: c.name, phone: c.phone, credit_limit: c.credit, balance, notes: null, created_at: iso(monthStart(6)) };
  });

  // 8. Shift kasir: satu shift per hari yang ada penjualannya; shift hari ini masih terbuka.
  const days = [...new Set(saleMeta.map((s) => Math.floor(s.at / DAY)))].sort((a, b) => a - b);
  const todayDay = Math.floor(nowMs / DAY);
  const shiftRows: Record<string, unknown>[] = [];
  days.forEach((day, k) => {
    const staffId = cashierOf(day * DAY);
    const opened = day * DAY + 1.5 * HOUR;
    const closed = day * DAY + 14 * HOUR;
    const openingCash = pick([300_000, 500_000, 500_000, 1_000_000]);
    const isOpen = day === todayDay;
    const expected = openingCash + saleMeta.filter((s) => s.staff === staffId && s.status === "completed" && s.at >= opened && s.at <= closed).reduce((a, s) => a + s.cash, 0);
    const variance = isOpen || rand() < 0.7 ? 0 : (rand() < 0.5 ? -1 : 1) * 1000 * (2 + Math.floor(rand() * 24));
    shiftRows.push({
      id: uid("5a07", k + 1),
      business_id: EVAL_BUSINESS_ID,
      location_id: toko,
      staff_id: staffId,
      opening_cash: openingCash,
      closing_cash: isOpen ? null : expected + variance,
      expected_cash: isOpen ? null : expected,
      cash_variance: isOpen ? null : variance,
      status: isOpen ? "open" : "closed",
      notes: variance === 0 ? null : "Selisih kas, dicek ulang saat tutup shift",
      opened_at: iso(opened),
      closed_at: isOpen ? null : iso(closed),
    });
  });
  if (todayDay * DAY + 1.5 * HOUR > nowMs) {
    const i = shiftRows.findIndex((s) => s.status === "open");
    if (i >= 0) shiftRows.splice(i, 1);
  }

  // 9. Impor nota: tiga nota yang cocok dengan pembelian di atas, satu perlu ditinjau, satu gagal.
  const importRows: Record<string, unknown>[] = [];
  const importItemRows: Record<string, unknown>[] = [];
  const groups = [...purchaseTxByGroup.entries()].filter(([, v]) => v.length >= 3).slice(0, 3);
  const SOURCES = ["ocr_photo", "excel", "ocr_photo"] as const;
  groups.forEach(([key, items], g) => {
    const [s, i] = key.split("|").map(Number);
    const importId = uid("5a09", g + 1);
    const at = monthStart(5 - i) + (5 + s) * DAY + 5 * HOUR;
    importRows.push({
      id: importId,
      business_id: EVAL_BUSINESS_ID,
      source: SOURCES[g],
      file_url: null,
      ocr_provider: SOURCES[g] === "ocr_photo" ? "gemini" : null,
      raw_ocr_text: SOURCES[g] === "ocr_photo" ? `NOTA ${EVAL_SUPPLIERS[s].name.toUpperCase()} (simulasi)\n${items.map((x) => `${x.p.name} ${x.p.partNumber} x${x.qty}`).join("\n")}` : null,
      status: "completed",
      uploaded_by: staff.warehouse,
      created_at: iso(at),
      processed_at: iso(at + 60_000),
    });
    items.forEach((x, k) => {
      importItemRows.push({
        id: uid("5a0a", importItemRows.length + 1),
        import_id: importId,
        raw_line_text: `${x.p.name} ${x.p.partNumber} x${x.qty}`,
        matched_product_id: pid(x.p.n),
        suggested_quantity: x.qty,
        suggested_transaction_type: "masuk",
        match_confidence: Number((0.9 + ((k * 7) % 10) / 100).toFixed(3)),
        status: "confirmed",
        reviewed_by: staff.warehouse,
        resulting_transaction_id: x.txId,
        created_at: iso(at),
      });
    });
  });
  const reviewId = uid("5a09", 11);
  const reviewAt = latest - 20 * HOUR;
  importRows.push(
    { id: reviewId, business_id: EVAL_BUSINESS_ID, source: "ocr_photo", file_url: null, ocr_provider: "gemini", raw_ocr_text: "NOTA CV EROPA AUTO PART (simulasi)\nFilter Oli Mahle 31372212 x24\nBilah Wiper Bosch 43315 x12\nSeal pompa air x2", status: "needs_review", uploaded_by: staff.warehouse, created_at: iso(reviewAt), processed_at: iso(reviewAt + 60_000) },
    { id: uid("5a09", 12), business_id: EVAL_BUSINESS_ID, source: "ocr_photo", file_url: null, ocr_provider: "gemini", raw_ocr_text: null, status: "failed", uploaded_by: staff.warehouse, created_at: iso(latest - 3 * DAY), processed_at: iso(latest - 3 * DAY + 30_000) },
  );
  [
    ["Filter Oli Mahle 31372212 x24", 6, 24, "matched", 0.97],
    ["Bilah Wiper Bosch 43315 x12", 8, 12, "matched", 0.93],
    ["Seal pompa air x2", null, 2, "unmatched", null],
  ].forEach(([raw, n, qty, status, conf]) => {
    importItemRows.push({
      id: uid("5a0a", importItemRows.length + 1),
      import_id: reviewId,
      raw_line_text: raw,
      matched_product_id: n === null ? null : pid(n as number),
      suggested_quantity: qty,
      suggested_transaction_type: "masuk",
      match_confidence: conf,
      status,
      reviewed_by: null,
      resulting_transaction_id: null,
      created_at: iso(reviewAt),
    });
  });

  // 10. Saran pemesanan ulang (rumus yang sama dengan cron) dan notifikasi.
  const finalBalance = (n: number) => {
    const p = byN.get(n)!;
    return p.toko + p.gudang;
  };
  const out90 = new Map<number, number>();
  const lastOut = new Map<number, number>();
  for (const t of ledger) {
    if (t.type !== "keluar") continue;
    lastOut.set(t.product, Math.max(lastOut.get(t.product) ?? 0, t.at));
    if (t.at >= nowMs - 90 * DAY) out90.set(t.product, (out90.get(t.product) ?? 0) + t.qty);
  }
  const suggestionRows: Record<string, unknown>[] = [];
  const notificationRows: Record<string, unknown>[] = [];
  const notify = (type: string, title: string, body: string, relatedId: string | null, ageHours: number, read: boolean) => {
    const at = latest - ageHours * HOUR;
    notificationRows.push({ id: uid("5a0c", notificationRows.length + 1), business_id: EVAL_BUSINESS_ID, staff_id: staff.owner, type, title, body, related_id: relatedId, sent_at: iso(at), read_at: read ? iso(at + HOUR) : null, created_at: iso(at) });
  };
  const pending = new Set<number>();
  for (const p of P) {
    const x = productExtras(p);
    const calc = calculateReorder({ totalOutbound: out90.get(p.n) ?? 0, totalAvailable: finalBalance(p.n), minThreshold: p.minThreshold, leadTimeDays: x.lead_time_days, safetyStock: x.safety_stock });
    if (!shouldCreateReorderSuggestion(calc, false)) continue;
    pending.add(p.n);
    const id = uid("5a0b", suggestionRows.length + 1);
    suggestionRows.push({
      id,
      business_id: EVAL_BUSINESS_ID,
      product_id: pid(p.n),
      suggested_quantity: calc.suggestedQuantity,
      reason: `Stok ${calc.totalAvailable} di bawah batas pesan ulang ${calc.effectiveThreshold} (rata-rata keluar ${calc.averageDailyOutbound.toFixed(2)} per hari).`,
      trend_snapshot: calc,
      status: "pending",
      acknowledged_by: null,
      suggested_supplier_id: supplierId(x.supplierIndex),
      created_at: iso(latest - 6 * HOUR),
    });
    notify("reorder_suggestion", `Saran pesan ulang: ${p.name}`, `Disarankan memesan ${calc.suggestedQuantity} ${p.unit}.`, id, 6, false);
  }
  const history3: [number, "ordered" | "acknowledged" | "dismissed", number][] = [[6, "ordered", 35], [8, "acknowledged", 21], [18, "dismissed", 12]];
  for (const [n, status, ageDays] of history3) {
    if (pending.has(n)) continue;
    const p = byN.get(n)!;
    const x = productExtras(p);
    suggestionRows.push({
      id: uid("5a0b", suggestionRows.length + 1),
      business_id: EVAL_BUSINESS_ID,
      product_id: pid(n),
      suggested_quantity: Math.max(p.minThreshold * 3, 6),
      reason: "Stok mendekati batas pesan ulang.",
      trend_snapshot: null,
      status,
      acknowledged_by: staff.owner,
      suggested_supplier_id: supplierId(x.supplierIndex),
      created_at: iso(latest - ageDays * DAY),
    });
  }
  P.filter((p) => finalBalance(p.n) <= p.minThreshold).slice(0, 4).forEach((p, k) =>
    notify("low_stock", `Stok menipis: ${p.name}`, `Sisa ${finalBalance(p.n)} ${p.unit} di semua lokasi.`, pid(p.n), 30 + k * 7, k > 1),
  );
  P.filter((p) => !lastOut.has(p.n) || lastOut.get(p.n)! < nowMs - 45 * DAY).slice(0, 3).forEach((p, k) =>
    notify("dead_stock", `Barang jarang terjual: ${p.name}`, "Belum ada penjualan dalam 45 hari terakhir.", pid(p.n), 50 + k * 9, true),
  );
  notify("system", "Data contoh siap", "Data simulasi penjualan, stok, dan pemasok sudah terisi.", null, 72, true);

  // 11. Ringkasan akhir untuk insert.
  const counterRows = [...counters.entries()].map(([year, counter]) => ({ business_id: EVAL_BUSINESS_ID, year, counter }));
  const ledgerRows = ledger.map((t) => ({
    id: t.id,
    business_id: EVAL_BUSINESS_ID,
    product_id: pid(t.product),
    location_id: t.loc,
    transaction_type: t.type,
    quantity: t.qty,
    unit_price: t.price,
    supplier_id: t.supplier,
    related_transaction_id: t.related ?? null,
    staff_id: t.staff,
    notes: t.notes,
    created_at: iso(t.at),
  }));

  return {
    suppliers: EVAL_SUPPLIERS.map((s, i) => ({ id: supplierId(i), business_id: EVAL_BUSINESS_ID, name: s.name, contact_person: s.contact_person, phone: s.phone, address: s.address, notes: "Pemasok contoh (data simulasi)", created_at: iso(openingAt) })),
    customers: customerRows,
    ledger: ledgerRows,
    sales: saleRows,
    saleItems: itemRows,
    salePayments: payRows,
    saleCounters: counterRows,
    customerPayments: customerPaymentRows,
    warrantyClaims: claimRows,
    shifts: shiftRows,
    opnames: opnameRows,
    receiptImports: importRows,
    receiptItems: importItemRows,
    reorderSuggestions: suggestionRows,
    notifications: notificationRows,
  };
}
