import { describe, it, expect } from "vitest";
import { guardRoute, isClearStockMovement } from "@/src/lib/agents/route-guard";
import scenarioFile from "@/src/lib/eval/scenarios.json";

describe("isClearStockMovement", () => {
  it.each<[string]>([
    ["klr 1 timng belt 240 dr toko"],
    ["msk 6 v-belt alternatr ke gudng"],
    ["Tadi kejual 1 radiator 240 di toko, tolong dikurangin"],
    ["Pindahin gril depan 240 ke gudang 2 biji"],
    ["transfr 3 saringan udara gudang -> toko"],
    ["Barang masuk 10 filter oli mahle ke gudang"],
    ["terjual sebanyak 2 oli gardan"],
  ])("pergerakan jelas: %s", (message) => {
    expect(isClearStockMovement(message)).toBe(true);
  });

  it.each<[string]>([
    ["trend jual kampas rem brembo 3 bln"],
    ["penjualan radiator 6 bulan"],
    ["Filter oli mahle penjualannya 6 bulan terakhir gimana?"],
    ["berapa yang terjual 3 bulan terakhir?"],
    ["Volvo 240 yang masuk kemarin berapa?"],
    ["stok wipr bosch brp"],
    ["Radiator Volvo 240 ada stoknya?"],
    ["Kurangin stok lampu"],
    ["Masuk filter udara baru ke gudang"],
  ])("bukan pergerakan jelas: %s", (message) => {
    expect(isClearStockMovement(message)).toBe(false);
  });
});

describe("guardRoute", () => {
  it("query dengan pergerakan jelas dialihkan ke transaction (T-10)", () => {
    const r = guardRoute("query", "klr 1 timng belt 240 dr toko");
    expect(r.agentType).toBe("transaction");
    expect(r.reason).toMatch(/Transaction Agent/);
  });

  it("pertanyaan tren tetap query", () => {
    expect(guardRoute("query", "trend jual kampas rem brembo 3 bln")).toEqual({ agentType: "query", reason: null });
    expect(guardRoute("query", "penjualan radiator 6 bulan")).toEqual({ agentType: "query", reason: null });
  });

  it("transaction dan off_topic tidak diubah oleh aturan ini", () => {
    expect(guardRoute("transaction", "klr 1 timng belt").agentType).toBe("transaction");
  });
});

describe("terhadap skenario /eval", () => {
  const scenarios = scenarioFile.scenarios as { id: string; message: string; expected_route: string }[];

  it("tidak ada skenario query/off_topic yang dialihkan ke transaksi", () => {
    const wrong = scenarios
      .filter((s) => s.expected_route !== "transaction" && isClearStockMovement(s.message))
      .map((s) => s.id);
    expect(wrong).toEqual([]);
  });
});
