import { describe, it, expect } from "vitest";
import scenarioFile from "@/src/lib/eval/scenarios.json";
import { EVAL_GUDANG_ID, EVAL_PRODUCTS, EVAL_TOKO_ID, buildSeedTransactions } from "@/src/lib/eval/seed-data";
import { buildPlan } from "@/src/lib/eval/run-store";
import type { Scenario } from "@/src/lib/eval/types";

const SCENARIOS = scenarioFile.scenarios as unknown as Scenario[];
const LOCATION_ID: Record<string, string> = { Toko: EVAL_TOKO_ID, Gudang: EVAL_GUDANG_ID };

/** Saldo awal tiap "barang|lokasi" dari ledger seed (sama dengan hasil Reset data eval). */
function startingBalances() {
  const partOf = new Map(EVAL_PRODUCTS.map((p) => [p.id, p.part_number]));
  const nameOf = new Map(Object.entries(LOCATION_ID).map(([name, id]) => [id, name]));
  const balances = new Map<string, number>();
  const { opening, sales } = buildSeedTransactions(new Date("2026-10-19T08:00:00Z"));
  for (const t of [...opening, ...sales]) {
    const key = `${partOf.get(t.product_id)}|${nameOf.get(t.location_id)}`;
    balances.set(key, (balances.get(key) ?? 0) + (t.transaction_type === "masuk" ? t.quantity : -t.quantity));
  }
  return balances;
}

/**
 * Menjalankan semua expected_stock_delta berurutan seperti run /eval (tiap skenario
 * multi lalu single, tanpa reset stok di antaranya) dan mengembalikan tiap eksekusi
 * yang membuat stok minus. Delta nol (skenario tolak / baca saja) tidak mengubah apa-apa.
 */
function findOverdrafts(scenarios: Scenario[], balances: Map<string, number>) {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const problems: string[] = [];
  for (const { scenarioId, mode } of buildPlan(scenarios.map((s) => s.id), ["multi_agent", "single_agent"])) {
    for (const d of byId.get(scenarioId)?.expected_stock_delta ?? []) {
      const key = `${d.product}|${d.location}`;
      const after = (balances.get(key) ?? 0) + d.delta;
      if (after < 0) {
        problems.push(`${scenarioId} (${mode}): ${d.product} di ${d.location} butuh ${-d.delta}, sisa ${balances.get(key) ?? 0}`);
      }
      balances.set(key, after);
    }
  }
  return problems;
}

describe("stok tenant eval tidak terkuras antar skenario", () => {
  it("semua expected_stock_delta cukup dari saldo seed, urut seperti run", () => {
    expect(findOverdrafts(SCENARIOS, startingBalances())).toEqual([]);
  });

  it("saldo seed sama dengan yang dipakai test ini (0 986 424 016 gudang 16)", () => {
    expect(startingBalances().get("0 986 424 016|Gudang")).toBe(16);
  });

  it("menangkap kasus Run 38: H-16 memakai LX443 setelah T-11 dan H-07", () => {
    const h16 = SCENARIOS.find((s) => s.id === "H-16")!;
    const old = {
      ...h16,
      expected_stock_delta: [
        { product: "LX443", location: "Gudang", delta: -3 },
        { product: "LX443", location: "Toko", delta: 3 },
      ],
    };
    const problems = findOverdrafts(
      SCENARIOS.map((s) => (s.id === "H-16" ? old : s)),
      startingBalances(),
    );
    expect(problems.some((p) => p.startsWith("H-16") && p.includes("LX443"))).toBe(true);
  });

  it("menangkap transfer 3 dari Gudang saat sisa 2", () => {
    const scenario = {
      id: "X-1",
      expected_stock_delta: [{ product: "EVAL-001", location: "Gudang", delta: -3 }],
    } as unknown as Scenario;
    const problems = findOverdrafts([scenario], new Map([["EVAL-001|Gudang", 2]]));
    expect(problems).toHaveLength(2); // multi minus (2-3), lalu single minus lagi
    expect(problems[0]).toContain("butuh 3, sisa 2");
  });
});
