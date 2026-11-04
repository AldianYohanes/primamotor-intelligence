import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/cache/indexeddb", () => ({ searchCachedStock: vi.fn(async () => []) }));

import { fetchTenantLocations, getLocationsFailure, runSalesTrend, searchProducts } from "@/src/lib/agents/turn/tools";

const htmlResponse = () =>
  ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
    },
  }) as unknown as Response;

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe("pencatatan alasan galat server", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchTenantLocations mencatat status HTTP dan pesan server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(503, { error: "Layanan sesi sedang tidak tersedia" })));
    expect(await fetchTenantLocations()).toBeNull();
    expect(getLocationsFailure()).toBe("HTTP 503: Layanan sesi sedang tidak tersedia");
  });

  it("fetchTenantLocations mencatat galat jaringan lalu menghapusnya saat berhasil", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await fetchTenantLocations()).toBeNull();
    expect(getLocationsFailure()).toBe("Failed to fetch");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { locations: [{ id: "l1", name: "Toko", type: "toko" }] })));
    expect(await fetchTenantLocations()).toHaveLength(1);
    expect(getLocationsFailure()).toBeNull();
  });

  it("searchProducts membawa alasan saat server membalas halaman HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse()));
    const search = await searchProducts("radiator", "c1", "b1");
    expect(search.fromCache).toBe(true);
    expect(search.failureReason).toMatch(/Unexpected token '</);
  });

  it("searchProducts tidak membawa alasan saat server sehat", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { results: [] })));
    const search = await searchProducts("radiator", "c1", "b1");
    expect(search.fromCache).toBe(false);
    expect(search.failureReason).toBeUndefined();
  });

  it("runSalesTrend: alasan masuk jejak, hasil untuk model tidak berubah", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse()));
    const out = await runSalesTrend({ product: "wiper bosch" }, "c1", "b1");
    expect(out.result).toEqual({
      error: "Server tidak bisa dihubungi, tren penjualan belum bisa dicek. Sampaikan ke staf untuk coba lagi.",
    });
    expect(out.serverFailure).toMatch(/Unexpected token '</);
  });
});
