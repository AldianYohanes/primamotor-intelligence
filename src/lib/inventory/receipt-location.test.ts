import { describe, it, expect } from "vitest";
import { pickReceiptLocation } from "@/src/lib/inventory/receipt-location";

describe("pickReceiptLocation", () => {
  it("memilih Gudang walau Toko tercantum lebih dulu", () => {
    expect(pickReceiptLocation([{ id: "t", type: "toko" }, { id: "g", type: "gudang" }])?.id).toBe("g");
  });
  it("jatuh ke Toko bila tidak ada Gudang", () => {
    expect(pickReceiptLocation([{ id: "t", type: "toko" }])?.id).toBe("t");
  });
  it("null bila tidak ada lokasi yang cocok", () => {
    expect(pickReceiptLocation([])).toBeNull();
  });
});
