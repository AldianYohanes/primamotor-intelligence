import { describe, it, expect } from "vitest";
import { cacheNoteFor, isOfflineNoMatch, offlineNoMatchReply } from "@/src/lib/agents/offline-answers";

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
