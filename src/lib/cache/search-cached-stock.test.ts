import { describe, it, expect } from "vitest";
import { matchesCachedQuery } from "@/src/lib/cache/indexeddb";

const radiator = { product_name: "Radiator Volvo 240", aliases: ["rad", "pendingin mesin"] };

describe("matchesCachedQuery", () => {
  it("cocok per kata, urutan bebas", () => {
    expect(matchesCachedQuery("radiator 240", radiator)).toBe(true);
    expect(matchesCachedQuery("240 radiator", radiator)).toBe(true);
  });

  it("mengabaikan tanda baca rusak dari model", () => {
    expect(matchesCachedQuery(":radiator:240", radiator)).toBe(true);
  });

  it("cocok lewat alias", () => {
    expect(matchesCachedQuery("pendingin mesin", radiator)).toBe(true);
  });

  it("toleran salah ketik untuk kata panjang, tidak untuk angka", () => {
    expect(matchesCachedQuery("radiater 240", radiator)).toBe(true);
    expect(matchesCachedQuery("radiator 241", radiator)).toBe(false);
  });

  it("semua kata harus ada", () => {
    expect(matchesCachedQuery("radiator 850", radiator)).toBe(false);
    expect(matchesCachedQuery("", radiator)).toBe(false);
  });

  it("baris lama tanpa alias tetap bisa dicari", () => {
    expect(matchesCachedQuery("radiator", { product_name: "Radiator Volvo 240" })).toBe(true);
  });
});
