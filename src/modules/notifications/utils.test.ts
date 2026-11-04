import { describe, it, expect } from "vitest";
import { isNotificationType, notificationHref } from "./utils";

describe("isNotificationType", () => {
  it("hanya menerima jenis yang dikenal", () => {
    expect(isNotificationType("low_stock")).toBe(true);
    expect(isNotificationType("system")).toBe(true);
    expect(isNotificationType("lainnya")).toBe(false);
    expect(isNotificationType(null)).toBe(false);
  });
});

describe("notificationHref", () => {
  it("saran belanja menuju halaman saran belanja ulang", () => {
    expect(notificationHref("reorder_suggestion", "p1", true)).toBe("/admin/reorder");
  });
  it("stok menipis menuju kartu stok produknya", () => {
    expect(notificationHref("low_stock", "p1", true)).toBe("/admin/stock/p1");
  });
  it("tanpa id produk atau tanpa akses portal tidak ada tautan", () => {
    expect(notificationHref("low_stock", null, true)).toBeNull();
    expect(notificationHref("low_stock", "p1", false)).toBeNull();
    expect(notificationHref("system", "p1", true)).toBeNull();
  });
});
