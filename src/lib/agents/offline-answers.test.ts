import { describe, it, expect } from "vitest";
import {
  cacheNoteFor,
  isOfflineNoMatch,
  looksUnbacked,
  mentionsStockMovement,
  offlineNoMatchReply,
} from "@/src/lib/agents/offline-answers";

describe("mentionsStockMovement", () => {
  it.each<[string]>([
    ["masuk 1 filter oli mahle ke toko"],
    ["msk 6 v-belt ke gudng"],
    ["klr 1 timing belt dr toko"],
    ["Pindahin 5 filter oli dari gudang ke toko"],
    ["tadi kejual 2 radiator"],
    ["Kurangin stok lampu"],
  ])("mengenali pergerakan barang: %s", (text: string) => {
    expect(mentionsStockMovement(text)).toBe(true);
  });

  it.each<[string]>([["stok busi bosch?"], ["filter oli mahle ada berapa"], ["penjualan radiator 6 bulan"]])(
    "pertanyaan stok bukan pergerakan: %s",
    (text: string) => {
      expect(mentionsStockMovement(text)).toBe(false);
    },
  );
});

describe("looksUnbacked", () => {
  it("angka atau menyuruh memakai alat", () => {
    expect(looksUnbacked("Busi Bosch ada 15 di toko")).toBe(true);
    expect(looksUnbacked("Hubungi alat untuk mendapatkan informasi stok filter oli Mahle.")).toBe(true);
    expect(looksUnbacked("Silakan panggil getStock dulu")).toBe(true);
  });

  it("jawaban biasa tanpa angka lolos", () => {
    expect(looksUnbacked("Boleh sebutkan nama barangnya?")).toBe(false);
  });
});

describe("isOfflineNoMatch", () => {
  it("hanya untuk hasil cache offline yang kosong", () => {
    expect(isOfflineNoMatch({ results: [], source: "offline_cache", status: "no_cached_match" })).toBe(true);
    expect(isOfflineNoMatch({ results: [] })).toBe(false); // online, memang tidak ada
    expect(isOfflineNoMatch({ results: [{}], source: "offline_cache" })).toBe(false);
  });
});

describe("offlineNoMatchReply", () => {
  it("tidak terbaca sebagai stok kosong", () => {
    const text = offlineNoMatchReply("busi bosch");
    expect(text).toContain("Stok busi bosch belum bisa dicek");
    expect(text).toContain("bukan berarti stoknya kosong");
  });
});

describe("cacheNoteFor", () => {
  const now = Date.UTC(2026, 9, 9, 10, 0, 0);

  it("menyebut umur cache tertua dari hasil getStock offline", () => {
    const trace = [
      { name: "getStock", result: { source: "offline_cache", last_synced_at: new Date(now - 5 * 60_000).toISOString() } },
    ];
    expect(cacheNoteFor(trace, now)).toBe(
      "(Data dari cache perangkat, tersinkron 5 mnt lalu; bisa berbeda dari stok terkini.)",
    );
  });

  it("null untuk jawaban dari server", () => {
    expect(cacheNoteFor([{ name: "getStock", result: { results: [] } }], now)).toBeNull();
    expect(cacheNoteFor([], now)).toBeNull();
  });
});
