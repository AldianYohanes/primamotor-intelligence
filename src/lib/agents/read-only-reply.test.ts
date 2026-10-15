import { describe, it, expect } from "vitest";
import { dropPinSentences, mentionsPinConfirmation } from "@/src/lib/agents/read-only-reply";

describe("mentionsPinConfirmation", () => {
  it.each<[string]>([
    ["Stok v-belt di gudang 4 pcs. Silakan konfirmasi dengan PIN."],
    ["Masukkan pin untuk melanjutkan"],
  ])("minta PIN: %s", (text) => {
    expect(mentionsPinConfirmation(text)).toBe(true);
  });

  it.each<[string]>([["Stok v-belt di gudang 4 pcs."], ["Ada pinggiran bodi yang lecet, stok 2."]])(
    "bukan PIN: %s",
    (text) => {
      expect(mentionsPinConfirmation(text)).toBe(false);
    },
  );
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
});
