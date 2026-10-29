import { describe, expect, it } from "vitest";
import { checkAgentServer, hasServerFallback } from "@/src/lib/eval/server-check";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("checkAgentServer", () => {
  it("lolos bila server mengembalikan hasil pencarian", async () => {
    expect(await checkAgentServer(async () => json({ results: [] }))).toEqual({ ok: true });
  });

  it("gagal dengan kode HTTP dan pesan error server", async () => {
    const result = await checkAgentServer(async () => json({ error: "Unauthorized" }, 401));
    expect(result).toEqual({ ok: false, reason: "HTTP 401: Unauthorized" });
  });

  it("gagal bila respons bukan hasil pencarian", async () => {
    const result = await checkAgentServer(async () => json({ ok: true }));
    expect(result.ok).toBe(false);
  });

  it("gagal bila jaringan putus", async () => {
    const result = await checkAgentServer(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result).toEqual({ ok: false, reason: "Failed to fetch" });
  });
});

describe("hasServerFallback", () => {
  it("mengenali hasil cache perangkat", () => {
    expect(hasServerFallback([{ name: "getStock", args: {}, result: { source: "offline_cache" } }])).toBe(true);
  });

  it("mengenali pencarian produk yang gagal", () => {
    expect(hasServerFallback([{ name: "updateStock", args: {}, result: { status: "product_search_failed" } }])).toBe(true);
  });

  it("mengenali daftar lokasi yang gagal dimuat", () => {
    expect(hasServerFallback([{ name: "updateStock", args: {}, result: { status: "locations_unavailable" } }])).toBe(true);
  });

  it("mengenali tren penjualan yang tidak bisa dicek karena server", () => {
    const error = "Server tidak bisa dihubungi, tren penjualan belum bisa dicek. Sampaikan ke staf untuk coba lagi.";
    expect(hasServerFallback([{ name: "getSalesTrend", args: {}, result: { error } }])).toBe(true);
  });

  it("galat lain (mis. nama barang kosong) bukan galat server", () => {
    expect(hasServerFallback([{ name: "getSalesTrend", args: {}, result: { error: "Nama barang belum disebut." } }])).toBe(false);
  });

  it("tidak menandai hasil dari server", () => {
    expect(hasServerFallback([{ name: "getStock", args: {}, result: { results: [] } }])).toBe(false);
    expect(hasServerFallback([])).toBe(false);
  });
});
