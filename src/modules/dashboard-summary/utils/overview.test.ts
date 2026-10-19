import { describe, it, expect } from "vitest";
import {
  buildLowStock,
  buildMonthlySales,
  buildTopProducts,
  lastMonthKeys,
  monthRangeStartUtc,
  wibMonthKey,
} from "./overview";

describe("bulan menurut WIB", () => {
  it("nota 17.00 UTC tanggal 31 sudah masuk bulan berikutnya di WIB", () => {
    expect(wibMonthKey("2026-01-31T17:00:00.000Z")).toBe("2026-02");
    expect(wibMonthKey("2026-01-31T16:00:00.000Z")).toBe("2026-01");
  });

  it("lastMonthKeys melewati pergantian tahun", () => {
    const now = new Date("2026-02-10T05:00:00.000Z");
    expect(lastMonthKeys(now, 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("monthRangeStartUtc = awal bulan pertama WIB dalam UTC", () => {
    const now = new Date("2026-02-10T05:00:00.000Z");
    expect(monthRangeStartUtc(now, 2).toISOString()).toBe(
      "2025-12-31T17:00:00.000Z",
    );
  });
});

describe("buildMonthlySales", () => {
  it("mengisi bulan kosong dengan 0 dan mengabaikan nota di luar rentang", () => {
    const now = new Date("2026-03-15T05:00:00.000Z");
    const res = buildMonthlySales(
      [
        { total_amount: 100, created_at: "2026-03-01T05:00:00.000Z" },
        { total_amount: 50, created_at: "2026-03-10T05:00:00.000Z" },
        { total_amount: 70, created_at: "2026-01-10T05:00:00.000Z" },
        { total_amount: 999, created_at: "2025-06-10T05:00:00.000Z" },
      ],
      now,
      3,
    );
    expect(res).toEqual([
      { month: "2026-01", revenue: 70, transaction_count: 1 },
      { month: "2026-02", revenue: 0, transaction_count: 0 },
      { month: "2026-03", revenue: 150, transaction_count: 2 },
    ]);
  });
});

describe("buildTopProducts", () => {
  it("menjumlah per produk, urut jumlah terjual, dipotong sesuai limit", () => {
    const res = buildTopProducts(
      [
        { product_id: "a", quantity: 2, subtotal: 20 },
        { product_id: "b", quantity: 5, subtotal: 10 },
        { product_id: "a", quantity: 4, subtotal: 40 },
        { product_id: "c", quantity: 1, subtotal: 5 },
      ],
      2,
    );
    expect(res).toEqual([
      { product_id: "a", quantity: 6, revenue: 60 },
      { product_id: "b", quantity: 5, revenue: 10 },
    ]);
  });
});

describe("buildLowStock", () => {
  const products = [
    { id: "p1", name: "Oli", part_number: null, unit: "pcs", min_threshold: 5 },
    { id: "p2", name: "Kampas", part_number: "K1", unit: "set", min_threshold: 3 },
    { id: "p3", name: "Busi", part_number: null, unit: "pcs", min_threshold: null },
    { id: "p4", name: "Rantai", part_number: null, unit: "pcs", min_threshold: 2 },
  ];

  it("menjumlah stok tersedia lintas lokasi, abaikan tanpa batas minimum", () => {
    const res = buildLowStock(products, [
      { product_id: "p1", quantity: 2, reserved_quantity: 0 },
      { product_id: "p1", quantity: 1, reserved_quantity: 0 },
      { product_id: "p2", quantity: 10, reserved_quantity: 0 },
      { product_id: "p3", quantity: 0, reserved_quantity: 0 },
    ]);
    expect(res.map((r) => r.product_id)).toEqual(["p1", "p4"]);
    expect(res[0].available_quantity).toBe(3);
  });

  it("memakai quantity - reserved bila available_quantity tidak ada", () => {
    const res = buildLowStock(products.slice(0, 1), [
      { product_id: "p1", quantity: 8, reserved_quantity: 4 },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].available_quantity).toBe(4);
  });
});
