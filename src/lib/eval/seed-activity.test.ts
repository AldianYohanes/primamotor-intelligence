import { describe, expect, it } from "vitest";
import { EVAL_GUDANG_ID, EVAL_PRODUCT_SEEDS, EVAL_TOKO_ID } from "@/src/lib/eval/seed-data";
import { EVAL_COMPATIBILITY, VOLUME, buildSeedActivity } from "@/src/lib/eval/seed-activity";

const NOW = new Date("2026-10-27T09:00:00Z");
const STAFF = { owner: "s-owner", warehouse: "s-gudang", cashiers: ["s-kasir1", "s-kasir2"] };
const IN = ["masuk", "transfer_in", "retur", "adjustment_in"];

type Row = ReturnType<typeof buildSeedActivity>;
const data: Row = buildSeedActivity(NOW, STAFF);

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

describe("seed aktivitas toko", () => {
  it("deterministik: dua kali bangun hasilnya sama", () => {
    expect(buildSeedActivity(NOW, STAFF)).toEqual(data);
  });

  it("saldo berjalan tidak pernah minus dan saldo akhir sama dengan seed dasar", () => {
    const bal = new Map<string, number>();
    for (const t of data.ledger) {
      const key = `${t.product_id}|${t.location_id}`;
      const next = (bal.get(key) ?? 0) + (IN.includes(t.transaction_type) ? t.quantity : -t.quantity);
      expect(next, `${t.notes} ${key}`).toBeGreaterThanOrEqual(0);
      bal.set(key, next);
    }
    for (const p of EVAL_PRODUCT_SEEDS) {
      const id = `e0000000-0d0c-0000-0000-${String(p.n).padStart(12, "0")}`;
      expect(bal.get(`${id}|${EVAL_TOKO_ID}`) ?? 0, `toko ${p.partNumber}`).toBe(p.toko);
      expect(bal.get(`${id}|${EVAL_GUDANG_ID}`) ?? 0, `gudang ${p.partNumber}`).toBe(p.gudang);
    }
  });

  it("ledger sudah urut waktu supaya trigger stok tidak melihat saldo minus", () => {
    const times = data.ledger.map((t) => t.created_at);
    expect([...times].sort()).toEqual(times);
  });

  it(`penjualan keluar per bulan = seed dasar x ${VOLUME}`, () => {
    for (const p of EVAL_PRODUCT_SEEDS) {
      const id = `e0000000-0d0c-0000-0000-${String(p.n).padStart(12, "0")}`;
      const byMonth = new Map<string, number>();
      for (const t of data.ledger) {
        if (t.product_id === id && t.transaction_type === "keluar") byMonth.set(monthKey(t.created_at), (byMonth.get(monthKey(t.created_at)) ?? 0) + t.quantity);
      }
      const sums = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
      expect(sums, p.partNumber).toEqual(p.sales.filter((q) => q > 0).map((q) => q * VOLUME));
    }
  });

  it("tiap barang nota punya baris ledger keluar yang jumlahnya sama", () => {
    const tx = new Map(data.ledger.map((t) => [t.id, t]));
    for (const item of data.saleItems) {
      const t = tx.get(item.stock_transaction_id as string)!;
      expect(t.transaction_type).toBe("keluar");
      expect(t.quantity).toBe(item.quantity);
    }
    const sums = new Map<string, number>();
    for (const item of data.saleItems) sums.set(item.sale_id as string, (sums.get(item.sale_id as string) ?? 0) + (item.subtotal as number));
    for (const sale of data.sales) expect(sums.get(sale.id as string)).toBe(sale.subtotal);
  });

  it("pembayaran nota cocok dengan total dan metode", () => {
    const paid = new Map<string, number>();
    for (const p of data.salePayments) paid.set(p.sale_id as string, (paid.get(p.sale_id as string) ?? 0) + (p.amount as number));
    for (const s of data.sales) {
      expect(s.total_amount).toBe((s.subtotal as number) - (s.discount_amount as number));
      if (s.payment_method === "piutang") expect(paid.has(s.id as string)).toBe(false);
      else expect((paid.get(s.id as string) ?? 0) - (s.change_amount as number)).toBe(s.total_amount);
    }
  });

  it("nomor nota unik dan berurutan per tahun", () => {
    const numbers = data.sales.map((s) => s.sale_number as string);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers[0]).toBe("INV/2026/000001");
    expect(data.saleCounters).toEqual([{ business_id: expect.any(String), year: 2026, counter: numbers.length }]);
  });

  it("shift: satu terbuka (hari ini), sisanya tutup dengan kas harapan sesuai rumus laporan shift", () => {
    expect(data.shifts.filter((s) => s.status === "open")).toHaveLength(1);
    for (const sh of data.shifts.filter((s) => s.status === "closed")) {
      const from = sh.opened_at as string;
      const to = sh.closed_at as string;
      const saleIds = new Set(
        data.sales.filter((s) => s.staff_id === sh.staff_id && s.status === "completed" && s.payment_method !== "piutang" && (s.created_at as string) >= from && (s.created_at as string) <= to).map((s) => s.id),
      );
      const cash = data.salePayments.filter((p) => saleIds.has(p.sale_id) && p.payment_method === "cash").reduce((a, p) => a + (p.amount as number), 0);
      expect(sh.expected_cash).toBe((sh.opening_cash as number) + cash);
      expect(sh.cash_variance).toBe((sh.closing_cash as number) - (sh.expected_cash as number));
    }
  });

  it("saldo piutang pelanggan = nota piutang selesai dikurangi cicilan, tidak melewati batas kredit", () => {
    for (const c of data.customers) {
      const owed = data.sales.filter((s) => s.customer_id === c.id && s.payment_method === "piutang" && s.status === "completed").reduce((a, s) => a + (s.total_amount as number), 0);
      const paid = data.customerPayments.filter((p) => p.customer_id === c.id).reduce((a, p) => a + (p.amount as number), 0);
      expect(c.balance).toBe(Math.max(owed - paid, 0));
      expect(c.balance as number).toBeLessThanOrEqual(c.credit_limit as number);
    }
    expect(data.sales.every((s) => s.payment_method !== "piutang" || s.customer_id)).toBe(true);
  });

  it("modul lain terisi: klaim garansi, void, opname, impor, saran pesan ulang, notifikasi", () => {
    expect(data.warrantyClaims.length).toBeGreaterThan(0);
    expect(data.sales.some((s) => s.status === "voided")).toBe(true);
    expect(data.opnames.length).toBeGreaterThan(5);
    expect(new Set(data.receiptImports.map((i) => i.status))).toEqual(new Set(["completed", "needs_review", "failed"]));
    expect(data.reorderSuggestions.length).toBeGreaterThan(0);
    expect(new Set(data.notifications.map((n) => n.type)).size).toBeGreaterThanOrEqual(3);
    expect(data.suppliers).toHaveLength(4);
    expect(EVAL_COMPATIBILITY.length).toBeGreaterThan(30);
  });

  it("opname: selisih tercatat sama dengan penyesuaian di ledger", () => {
    const adj = data.ledger.filter((t) => t.transaction_type.startsWith("adjustment"));
    const diffs = data.opnames.filter((o) => o.system_quantity !== o.counted_quantity);
    expect(adj).toHaveLength(diffs.length);
  });

  it("tetap konsisten untuk tanggal lain (awal bulan, akhir tahun)", () => {
    for (const d of ["2026-11-01T01:00:00Z", "2027-01-02T10:00:00Z", "2026-12-31T23:30:00Z"]) {
      const r = buildSeedActivity(new Date(d), STAFF);
      const bal = new Map<string, number>();
      for (const t of r.ledger) {
        const key = `${t.product_id}|${t.location_id}`;
        const next = (bal.get(key) ?? 0) + (IN.includes(t.transaction_type) ? t.quantity : -t.quantity);
        expect(next, d).toBeGreaterThanOrEqual(0);
        bal.set(key, next);
      }
    }
  });
});
