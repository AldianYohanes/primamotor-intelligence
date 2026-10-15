import { describe, it, expect } from "vitest";
import { dropPinSentences, mentionsPinConfirmation, staffMentionsPin } from "@/src/lib/agents/read-only-reply";

describe("mentionsPinConfirmation", () => {
  it.each<[string]>([
    ["Stok v-belt di gudang 4 pcs. Silakan konfirmasi dengan PIN."],
    ["Masukkan pin untuk melanjutkan"],
    ["Perubahan stok tetap butuh konfirmasi PIN."],
    ["Silakan ketik PIN Anda."],
  ])("minta PIN: %s", (text) => {
    expect(mentionsPinConfirmation(text)).toBe(true);
  });

  it.each<[string]>([
    ["Stok v-belt di gudang 4 pcs."],
    ["Ada pinggiran bodi yang lecet, stok 2."],
    ["Stok pin piston di Gudang 5."],
    ["Pin kaliper kiri: Toko 2, Gudang 7."],
  ])("bukan permintaan PIN: %s", (text) => {
    expect(mentionsPinConfirmation(text)).toBe(false);
  });

  it("nama barang dari getStock tidak dihitung, permintaan PIN di kalimat yang sama tetap", () => {
    expect(mentionsPinConfirmation("Stok Pin Piston Std di Gudang 5.", ["Pin Piston Std"])).toBe(false);
    expect(mentionsPinConfirmation("Stok Pin Piston Std di Gudang 5, konfirmasi dengan PIN.", ["Pin Piston Std"])).toBe(true);
  });
});

describe("staffMentionsPin", () => {
  it("staf menyebut PIN sendiri", () => {
    expect(staffMentionsPin("Kurangi stok radiator 2, tidak perlu PIN")).toBe(true);
    expect(staffMentionsPin("PIN saya lupa, gimana?")).toBe(true);
  });
  it("kata lain yang memuat 'pin' tidak", () => {
    expect(staffMentionsPin("brp stok pinggiran bodi?")).toBe(false);
  });
});

describe("dropPinSentences", () => {
  it("membuang kalimat PIN, data stok tetap (H-14)", () => {
    expect(dropPinSentences("Stok v-belt alternator di gudang: 4 pcs. Silakan konfirmasi dengan PIN.")).toBe(
      "Stok v-belt alternator di gudang: 4 pcs.",
    );
  });

  it("menjaga baris lain", () => {
    expect(dropPinSentences("Gudang: 4 pcs\nToko: 2 pcs\nKonfirmasi dengan PIN ya!")).toBe("Gudang: 4 pcs\nToko: 2 pcs");
  });

  it("tanpa PIN tidak berubah", () => {
    expect(dropPinSentences("Gudang: 4 pcs.")).toBe("Gudang: 4 pcs.");
  });

  it("hanya kalimat PIN → kosong", () => {
    expect(dropPinSentences("Konfirmasi dengan PIN.")).toBe("");
  });

  it("satu kalimat dengan koma: data stok selamat, anak kalimat PIN dibuang", () => {
    expect(dropPinSentences("Stok tangki air radiator di Gudang 3 pcs, silakan konfirmasi dengan PIN.")).toBe(
      "Stok tangki air radiator di Gudang 3 pcs.",
    );
    expect(dropPinSentences("Stok di Gudang 3 pcs dan mohon masukkan PIN")).toBe("Stok di Gudang 3 pcs.");
  });

  it("titik desimal/ribuan tidak memotong kalimat", () => {
    expect(dropPinSentences("Harga Rp 25.000, stok 3 pcs, konfirmasi dengan PIN.")).toBe("Harga Rp 25.000, stok 3 pcs.");
  });

  it("nama barang berisi 'pin' tidak ikut dibuang", () => {
    expect(dropPinSentences("Stok Pin Piston di Gudang 5.", ["Pin Piston"])).toBe("Stok Pin Piston di Gudang 5.");
  });
});
