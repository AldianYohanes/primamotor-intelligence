import { describe, it, expect } from "vitest";
import {
  claimsRecorded,
  contradictsStock,
  stockReply,
  summarizeStock,
} from "@/src/lib/agents/stock-summary";

function row(location_name: string, available_quantity: number) {
  return { location_id: location_name.toLowerCase(), location_name, quantity: available_quantity, available_quantity };
}

const wiper = {
  results: [
    {
      product_id: "p1",
      name: "Wiper Bosch",
      similarity_score: 0.9,
      stock_by_location: [row("Toko", 0), row("Gudang", 2)],
    },
  ],
};

describe("summarizeStock", () => {
  it("menyusun stok per lokasi dan total", () => {
    const s = summarizeStock(wiper);
    expect(s?.products).toHaveLength(1);
    expect(s?.products[0]).toMatchObject({ name: "Wiper Bosch", total: 2 });
    expect(s?.products[0].locations).toEqual([
      { name: "Toko", quantity: 0 },
      { name: "Gudang", quantity: 2 },
    ]);
  });

  it("menggabungkan baris cache offline (satu baris per lokasi) per produk", () => {
    const s = summarizeStock({
      results: [
        { product_id: "p1", name: "Busi", stock_by_location: [row("Toko", 3)] },
        { product_id: "p1", name: "Busi", stock_by_location: [row("Gudang", 4)] },
      ],
    });
    expect(s?.products).toHaveLength(1);
    expect(s?.products[0].total).toBe(7);
  });

  it("null untuk hasil kosong, error, atau tanpa data", () => {
    expect(summarizeStock({ results: [] })).toBeNull();
    expect(summarizeStock({ error: "x" })).toBeNull();
    expect(summarizeStock(null)).toBeNull();
  });
});

describe("stockReply", () => {
  it("menyebut stok tiap lokasi dan tidak bilang kosong di semua lokasi", () => {
    const text = stockReply(summarizeStock(wiper)!);
    expect(text).toContain("Wiper Bosch");
    expect(text).toContain("Toko 0");
    expect(text).toContain("Gudang 2");
    expect(text).not.toMatch(/semua lokasi/i);
  });

  it("bilang kosong di semua lokasi hanya bila semuanya nol", () => {
    const s = summarizeStock({
      results: [{ product_id: "p", name: "Kampas", stock_by_location: [row("Toko", 0), row("Gudang", 0)] }],
    })!;
    expect(stockReply(s)).toMatch(/kosong di semua lokasi/i);
  });

  it("memberi catatan belum ada perubahan bila model mengaku mencatat", () => {
    expect(stockReply(summarizeStock(wiper)!, { notRecorded: true })).toMatch(/belum ada perubahan stok/i);
  });

  it("beberapa produk ditulis satu baris per produk", () => {
    const s = summarizeStock({
      results: [
        { product_id: "a", name: "Filter A", stock_by_location: [row("Toko", 1)] },
        { product_id: "b", name: "Filter B", stock_by_location: [row("Toko", 5)] },
      ],
    })!;
    const text = stockReply(s);
    expect(text).toContain("Filter A");
    expect(text).toContain("Filter B");
  });
});

describe("claimsRecorded", () => {
  it.each(["Stok sudah saya catat.", "Sudah dicatat ya", "Berhasil mencatat 5 unit", "Transaksi tercatat."])(
    "mengenali klaim mencatat: %s",
    (t) => expect(claimsRecorded(t)).toBe(true),
  );
  it("tidak salah kena pada jawaban stok biasa", () => {
    expect(claimsRecorded("Stok Wiper Bosch: Toko 0, Gudang 2.")).toBe(false);
  });
});

describe("contradictsStock", () => {
  const s = summarizeStock(wiper)!;

  it("menangkap 'kosong' padahal ada stok di salah satu lokasi", () => {
    expect(contradictsStock("Wiper Bosch kosong di semua lokasi.", s)).toBe(true);
    expect(contradictsStock("Stoknya habis.", s)).toBe(true);
  });

  it("menangkap angka lokasi yang salah", () => {
    expect(contradictsStock("Di Toko ada 5, di Gudang 2.", s)).toBe(true);
  });

  it("jawaban yang cocok dengan data lolos", () => {
    expect(contradictsStock("Toko 0 (habis), Gudang 2.", s)).toBe(false);
    expect(contradictsStock("Di toko ada 0, di gudang ada 2 buah.", s)).toBe(false);
  });

  it("'habis' di satu lokasi yang memang nol tidak dianggap salah", () => {
    expect(contradictsStock("Stok di Toko habis, di Gudang masih 2.", s)).toBe(false);
  });

  it("klaim mencatat selalu dianggap salah untuk jawaban pembacaan", () => {
    expect(contradictsStock("Sudah saya catat. Toko 0, Gudang 2.", s)).toBe(true);
  });

  it("klaim kosong benar bila semua nol", () => {
    const zero = summarizeStock({
      results: [{ product_id: "p", name: "Kampas", stock_by_location: [row("Toko", 0), row("Gudang", 0)] }],
    })!;
    expect(contradictsStock("Kampas kosong di semua lokasi.", zero)).toBe(false);
  });
});
