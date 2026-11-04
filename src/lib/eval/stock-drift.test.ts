import { describe, expect, it } from "vitest";
import { stockDrift } from "@/src/lib/eval/stock-drift";

describe("stockDrift", () => {
  it("kosong bila stok sama", () => {
    expect(stockDrift({ "p1:l1": 2, "p2:l1": 5 }, { "p1:l1": 2, "p2:l1": 5 })).toEqual([]);
  });

  it("menyebut kunci yang jumlahnya beda", () => {
    expect(stockDrift({ "p1:l1": 2, "p2:l1": 5 }, { "p1:l1": 0, "p2:l1": 5 })).toEqual(["p1:l1"]);
  });

  it("kunci yang hanya ada di satu sisi dihitung 0", () => {
    expect(stockDrift({ "p1:l1": 0 }, {})).toEqual([]);
    expect(stockDrift({}, { "p3:l2": 4 })).toEqual(["p3:l2"]);
  });

  it("hasilnya terurut", () => {
    expect(stockDrift({ b: 1, a: 1 }, { b: 2, a: 2 })).toEqual(["a", "b"]);
  });
});
