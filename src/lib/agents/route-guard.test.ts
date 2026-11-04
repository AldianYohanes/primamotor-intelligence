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

describe("guardRoute: jaring pengaman OFF_TOPIC", () => {
  const scenarios = scenarioFile.scenarios as { id: string; message: string; expected_route: string }[];

  it("pesan off_topic di /eval (kategori O) tidak pernah dialihkan", () => {
    const rerouted = scenarios
      .filter((s) => s.expected_route === "off_topic")
      .filter((s) => guardRoute("off_topic", s.message).agentType !== "off_topic")
      .map((s) => s.id);
    expect(rerouted).toEqual([]);
  });

  it.each<[string, "query" | "transaction"]>([
    ["Cek stok kampas rem depan brembo dong, di gudang masih ada?", "query"],
    ["Radiator Volvo 240 ada stoknya?", "query"],
    ["stok wipr bosch brp", "query"],
    ["Ada customer nanya karbu 240, kita masih pegang gak?", "query"],
    ["Tail lamp kiri kosong ya di depan? sisa lampu berapa", "query"],
    ["Wiper bosch lagi rame gak belakangan ini?", "query"],
    ["Filter oli mahle penjualannya 6 bulan terakhir gimana?", "query"],
    ["Kurangin stok lampu", "transaction"],
    ["klr 1 timng belt 240 dr toko", "transaction"],
    ["Tadi kejual 1 radiator 240 di toko, tolong dikurangin", "transaction"],
  ])("pesan stok yang salah dibuang ke off_topic dipulihkan: %s", (message, expected) => {
    const r = guardRoute("off_topic", message);
    expect(r.agentType).toBe(expected);
    expect(r.reason).toBeTruthy();
  });

  it.each<[string]>([
    ["Siapa presiden Indonesia sekarang?"],
    ["Halo, selamat pagi"],
    ["Cara ganti busi yang benar gimana?"],
    ["Harga aki di toko sebelah berapa?"],
    ["Cara ganti timing belt volvo 240 gimana urutannya?"],
    ["Kamu bisa cek stok nggak?"],
    ["Apa saja kemampuanmu?"],
    ["Volvo 240 itu bagus gak buat mobil harian?"],
    ["Rekomendasi oli mesin yang bagus buat volvo"],
    ["Hitungin 125 ribu kali 7 dong"],
  ])("tetap off_topic: %s", (message) => {
    expect(guardRoute("off_topic", message)).toEqual({ agentType: "off_topic", reason: null });
  });

  it("query dan transaction yang tidak ada pergerakan jelas tidak diubah", () => {
    expect(guardRoute("query", "Cek stok kampas rem").agentType).toBe("query");
    expect(guardRoute("transaction", "Kurangin stok lampu").agentType).toBe("transaction");
  });
});

describe("guardRoute queryGuard (Router salah memilih transaksi)", () => {
  const guard = (m: string, queryGuard = true) => guardRoute("transaction", m, { queryGuard });

  it("pertanyaan stok dan tren dialihkan ke Query Agent", () => {
    for (const m of ["aki gs 70ah masih ada ga?", "sisa busi ngk tinggal berapa", "tren jual kampas kopling 3 bulan", "stok seal klep brp"]) {
      expect(guard(m).agentType).toBe("query");
    }
  });

  it("pencatatan tetap transaksi, termasuk tanpa kata pindah", () => {
    for (const m of ["masuk 6 busi ngk ke gudang", "kurangin 1 kampas kopling", "tarik 2 seal klep dari gudang", "naikin 3 aki ke toko dari stok gudang", "seal klep laku 1 di toko"]) {
      expect(guard(m).agentType).toBe("transaction");
    }
  });

  it("tanpa opsi queryGuard perilaku lama (transaksi tidak diubah)", () => {
    expect(guard("aki gs 70ah masih ada ga?", false).agentType).toBe("transaction");
  });
});
