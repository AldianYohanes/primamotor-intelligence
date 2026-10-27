import { describe, it, expect } from "vitest";
import scenarioFile from "@/src/lib/eval/scenarios.json";
import {
  EVAL_GUDANG_ID,
  EVAL_PRODUCTS,
  EVAL_TOKO_ID,
  buildSeedTransactions,
} from "@/src/lib/eval/seed-data";

const NOW = new Date("2026-10-19T08:00:00Z");

function balance(productNo: string, locationId: string) {
  const id = EVAL_PRODUCTS.find((p) => p.part_number === productNo)!.id;
  const { opening, sales } = buildSeedTransactions(NOW);
  return [...opening, ...sales]
    .filter((t) => t.product_id === id && t.location_id === locationId)
    .reduce((sum, t) => sum + (t.transaction_type === "masuk" ? t.quantity : -t.quantity), 0);
}

describe("buildSeedTransactions", () => {
  it("saldo akhir sama dengan kolom toko/gudang seed_eval.sql", () => {
    expect(balance("LX443", EVAL_TOKO_ID)).toBe(9);
    expect(balance("LX443", EVAL_GUDANG_ID)).toBe(15);
    expect(balance("1372441", EVAL_TOKO_ID)).toBe(0);
    expect(balance("3518885", EVAL_GUDANG_ID)).toBe(0);
  });

  it("riwayat Bilah Wiper Bosch per bulan seperti seed (dipakai Q-13)", () => {
    const id = EVAL_PRODUCTS.find((p) => p.part_number === "43315")!.id;
    const { sales } = buildSeedTransactions(NOW);
    expect(sales.filter((t) => t.product_id === id).map((t) => [t.created_at.slice(0, 10), t.quantity])).toEqual([
      ["2026-05-10", 3],
      ["2026-06-10", 5],
      ["2026-07-10", 9],
      ["2026-08-10", 11],
      ["2026-09-10", 6],
      ["2026-10-10", 4],
    ]);
  });

  it("transaksi bulan ini tidak lewat dari satu jam sebelum sekarang", () => {
    const early = new Date("2026-10-03T08:00:00Z");
    const { sales } = buildSeedTransactions(early);
    const latest = Math.max(...sales.map((t) => Date.parse(t.created_at)));
    expect(latest).toBe(early.getTime() - 60 * 60 * 1000);
  });

  it("saldo awal masuk 6 bulan lalu, sebelum semua penjualan", () => {
    const { opening, sales } = buildSeedTransactions(NOW);
    expect(new Set(opening.map((t) => t.created_at))).toEqual(new Set(["2026-04-01T00:00:00.000Z"]));
    expect(Math.min(...sales.map((t) => Date.parse(t.created_at)))).toBeGreaterThan(Date.parse("2026-04-01T00:00:00Z"));
  });
});

describe("EVAL_PRODUCTS", () => {
  it("memuat semua produk yang dirujuk skenario", () => {
    const parts = new Set(EVAL_PRODUCTS.map((p) => p.part_number));
    for (const s of scenarioFile.scenarios as Array<Record<string, unknown>>) {
      const refs = [
        s.expected_entity,
        (s.expected_action as { product?: string } | undefined)?.product,
        ...((s.expected_stock_delta as { product: string }[] | undefined) ?? []).map((d) => d.product),
      ].filter(Boolean);
      for (const r of refs) expect(parts.has(r as string), `${s.id} → ${r}`).toBe(true);
    }
  });
});

describe("seed_eval.sql", () => {
  it("memuat produk dan alias yang sama dengan seed-data.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const { EVAL_ALIASES } = await import("@/src/lib/eval/seed-data");
    const sql = readFileSync("supabase/seed_eval.sql", "utf8");
    for (const p of EVAL_PRODUCTS) expect(sql, p.part_number).toContain(`'${p.part_number}', '${p.name}'`);
    for (const a of EVAL_ALIASES) expect(sql, a.alias).toContain(`('${a.product_id}', '${a.alias}'`);
  });
});
