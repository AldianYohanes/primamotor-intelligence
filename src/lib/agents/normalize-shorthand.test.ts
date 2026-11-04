import { describe, it, expect } from "vitest";
import { agentInputMessage, normalizeShorthand } from "@/src/lib/agents/normalize-shorthand";

describe("agentInputMessage", () => {
  it("agent menerima kata utuh, bukan singkatan chat (H-05)", () => {
    expect(agentInputMessage("klr 2 v-belt alternator dr gdg")).toBe("keluar 2 v-belt alternator dari gudang");
    expect(agentInputMessage("msk 6 filter oli ke gdg")).toBe("masuk 6 filter oli ke gudang");
  });

  it("pesan tanpa singkatan tidak berubah", () => {
    const text = "Catat 3 busi bosch keluar dari toko";
    expect(agentInputMessage(text)).toBe(text);
  });
});

describe("normalizeShorthand", () => {
  it.each<[string, string]>([
    ["klr 1 timng belt 240 dr toko", "keluar 1 timng belt 240 dari toko"],
    ["MSK 5 filter oli ke gdg", "masuk 5 filter oli ke gudang"],
    ["brp sisa wiper yg ada utk toko?", "berapa sisa wiper yang ada untuk toko?"],
    ["pindahin 3 busi, udh sdh blm", "pindahkan 3 busi, sudah sudah belum"],
    ["trend jual 3 bln, 1 thn", "trend jual 3 bulan, 1 tahun"],
    ["trf 2 saringan gudng -> toko", "transfer 2 saringan gudang -> toko"],
    ["ad ga stoplamp 740 di gdg", "ada ga stoplamp 740 di gudang"],
  ])("%s", (input, expected) => {
    expect(normalizeShorthand(input)).toBe(expected);
  });

  it("hanya mengganti kata utuh", () => {
    expect(normalizeShorthand("drum rem, gdgx, mskn, blmbang")).toBe("drum rem, gdgx, mskn, blmbang");
  });

  it("tanpa singkatan, teks tidak berubah", () => {
    const text = "Cek stok kampas rem depan brembo dong, di gudang masih ada?";
    expect(normalizeShorthand(text)).toBe(text);
  });
});
