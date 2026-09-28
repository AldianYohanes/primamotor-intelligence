import { describe, it, expect } from "vitest";
import {
  dedupeResults,
  describeStock,
  pickProduct,
  type ProductSearchResult,
} from "@/src/lib/agents/product-resolution";

const r = (product_id: string, name: string, similarity_score?: number): ProductSearchResult => ({
  product_id,
  name,
  similarity_score,
});

describe("dedupeResults", () => {
  it("menyisakan satu baris per produk dengan skor tertinggi, urut menurun", () => {
    const out = dedupeResults([r("a", "Filter Udara Mahle", 0.68), r("b", "Filter Oli Mahle", 0.3), r("a", "Filter Udara Mahle", 0.7)]);
    expect(out.map((x) => [x.product_id, x.similarity_score])).toEqual([
      ["a", 0.7],
      ["b", 0.3],
    ]);
  });
});

describe("pickProduct", () => {
  it("cocok persis diambil walau ada kandidat lain yang cukup mirip", () => {
    const pick = pickProduct([r("oli", "Filter Oli Mahle", 1), r("udara", "Filter Udara Mahle", 0.9)]);
    expect(pick).toMatchObject({ status: "match", product: { product_id: "oli" } });
  });

  it("pemenang jelas diambil (duplikat hasil alias tidak dihitung sebagai pesaing)", () => {
    const pick = pickProduct([
      r("udara", "Filter Udara Mahle", 0.684),
      r("udara", "Filter Udara Mahle", 0.684),
      r("oli", "Filter Oli Mahle", 0.304),
    ]);
    expect(pick).toMatchObject({ status: "match", product: { product_id: "udara" } });
  });

  it("satu-satunya hasil relevan diambil walau skornya sedang", () => {
    expect(pickProduct([r("tb", "Timing Belt Volvo 240 B230", 0.4)])).toMatchObject({ status: "match" });
  });

  it("ambigu bila beberapa kandidat berdekatan", () => {
    const pick = pickProduct([
      r("l1", "Lampu Belakang Kiri", 0.45),
      r("l2", "Lampu Belakang Kanan", 0.44),
      r("l3", "Lampu Sein Depan", 0.4),
    ]);
    expect(pick.status).toBe("ambiguous");
    if (pick.status === "ambiguous") expect(pick.candidates.map((c) => c.product_id)).toEqual(["l1", "l2", "l3"]);
  });

  it("tidak ada hasil atau semua terlalu jauh berarti none", () => {
    expect(pickProduct([])).toEqual({ status: "none" });
    expect(pickProduct([r("x", "Gril Depan", 0.1)])).toEqual({ status: "none" });
  });

  it("hasil cache offline tanpa skor tetap bisa dipilih", () => {
    expect(pickProduct([r("x", "Radiator Volvo 240")])).toMatchObject({ status: "match" });
  });
});

describe("describeStock", () => {
  it("merangkum stok tersedia per lokasi", () => {
    expect(
      describeStock({
        product_id: "p",
        name: "P",
        stock_by_location: [
          { location_id: "lt", location_name: "Toko", available_quantity: 1 },
          { location_id: "lg", location_name: "Gudang", available_quantity: 2 },
        ],
      }),
    ).toBe("Toko 1 · Gudang 2");
    expect(describeStock({ product_id: "p", name: "P" })).toBe("belum ada stok tercatat");
  });
});
