import { describe, it, expect } from "vitest";
import { parseSalesPeriod, stripSalesPeriod } from "@/src/lib/agents/sales-period";

describe("parseSalesPeriod", () => {
  it.each<[string, number]>([
    ["kampas rem brembo 3 bln", 3],
    ["penjualan radiator 6 bulan", 6],
    ["tren wiper 2 bulan terakhir", 2],
    ["jual busi 4bl", 4],
    ["oli gardan setahun gimana?", 12],
    ["filter udara 1 tahun", 12],
    ["filter udara 2 thn", 24],
    ["filter udara 5 tahun", 24],
    ["wiper setengah tahun", 6],
    ["wiper sebulan lalu", 1],
    ["wiper 40 bulan", 24],
  ])("%s -> %i bulan", (text, months) => {
    expect(parseSalesPeriod(text)?.months).toBe(months);
  });

  it.each<[string]>([
    ["stok filter oli mahle"],
    ["v-belt alternator 240"],
    ["klr 2 bulat"],
    ["0 bulan"],
  ])("tanpa periode: %s", (text) => {
    expect(parseSalesPeriod(text)).toBeNull();
  });
});

describe("stripSalesPeriod", () => {
  it("membuang frasa periode dari nama barang", () => {
    expect(stripSalesPeriod("kampas rem brembo 3 bln")).toBe("kampas rem brembo");
    expect(stripSalesPeriod("wiper bosch 2 bulan terakhir")).toBe("wiper bosch");
    expect(stripSalesPeriod("oli gardan setahun")).toBe("oli gardan");
  });
  it("tanpa periode, teks tidak berubah", () => {
    expect(stripSalesPeriod("filter oli mahle")).toBe("filter oli mahle");
  });
  it("tidak mengosongkan nama barang", () => {
    expect(stripSalesPeriod("3 bulan")).toBe("3 bulan");
  });
});
