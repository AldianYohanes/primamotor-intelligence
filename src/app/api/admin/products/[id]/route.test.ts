import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabase } from "../../../../../test-utils/mock-supabase";

const mockCreateClient = vi.fn();
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));
// Otorisasi terpusat membaca identitas dari mock Supabase yang sama.
vi.mock("@/src/lib/auth/staff-context", async () =>
  (await import("../../../../../test-utils/mock-staff-context")).createStaffContextMock(() => mockCreateClient()),
);
vi.mock("@/src/lib/logging/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { PATCH } from "./route";

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/prod-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: "prod-1" }) };
}

describe("PATCH /api/admin/products/[id]", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
  });

  it("menolak request tanpa user (401)", async () => {
    mockCreateClient.mockReturnValue(createMockSupabase({ user: null }));

    const res = await PATCH(patchRequest({ name: "X" }), params());

    expect(res.status).toBe(401);
  });

  it("menolak body kosong (400) — tidak ada field untuk diperbarui", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [
            { data: { id: "staff-1", business_id: "biz-a", role: "owner" }, error: null },
          ],
        },
      }),
    );

    const res = await PATCH(patchRequest({}), params());

    expect(res.status).toBe(400);
  });

  it("menolak field yang tidak dikenal (400) — schema .strict()", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [
            { data: { id: "staff-1", business_id: "biz-a", role: "owner" }, error: null },
          ],
        },
      }),
    );

    const res = await PATCH(patchRequest({ harga_ngasal: 100 }), params());

    expect(res.status).toBe(400);
  });

  it("§15.4 — menolak role 'staff' (bukan owner/admin) dengan 403, termasuk untuk edit aliases-saja", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [
            { data: { id: "staff-1", business_id: "biz-a", role: "staff" }, error: null },
          ],
        },
      }),
    );

    const res = await PATCH(patchRequest({ aliases: [] }), params());
    const body = await res.json();

    expect(res.status).toBe(403);
    // Ini poin utamanya: sebelum guard ini ada, request persis seperti ini
    // (role staff, aliases=[]) akan lolos ke DELETE product_aliases yang
    // diam-diam 0 baris kena RLS, lalu balas 200 sukses palsu. Guard ini
    // yang mencegah itu — gagal LOUD dengan 403, bukan diam-diam.
    expect(body.error).toMatch(/owner\/admin/i);
  });

  it("owner berhasil update field produk biasa (200), tanpa menyentuh product_aliases", async () => {
    const supabase = createMockSupabase({
      user: { id: "auth-user-1" },
      from: {
        staff: [
          { data: { id: "staff-1", business_id: "biz-a", role: "owner" }, error: null },
        ],
        products: [
          { data: { id: "prod-1", name: "Filter Oli Baru" }, error: null },
        ],
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const res = await PATCH(patchRequest({ name: "Filter Oli Baru" }), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.product.name).toBe("Filter Oli Baru");
    expect(supabase.from).not.toHaveBeenCalledWith("product_aliases");
  });

  it("owner berhasil replace aliases (200) — delete lalu insert product_aliases", async () => {
    const supabase = createMockSupabase({
      user: { id: "auth-user-1" },
      from: {
        staff: [
          { data: { id: "staff-1", business_id: "biz-a", role: "owner" }, error: null },
        ],
        // productData kosong (cuma aliases) → jalur select/maybeSingle, BUKAN update.
        products: [{ data: { id: "prod-1" }, error: null }],
        product_aliases: [
          { data: null, error: null }, // hasil delete
          { data: null, error: null }, // hasil insert
        ],
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const res = await PATCH(
      patchRequest({ aliases: ["karbu", "karburator"] }),
      params(),
    );

    expect(res.status).toBe(200);
    const calls = supabase.from.mock.calls as [string][];
    const productAliasesCallCount = calls.filter(
      ([table]) => table === "product_aliases",
    ).length;
    expect(productAliasesCallCount).toBe(2); // delete + insert
  });

  it("aliases=[] (kosongkan semua) — cuma delete dipanggil, insert TIDAK dipanggil", async () => {
    const supabase = createMockSupabase({
      user: { id: "auth-user-1" },
      from: {
        staff: [
          { data: { id: "staff-1", business_id: "biz-a", role: "owner" }, error: null },
        ],
        products: [{ data: { id: "prod-1" }, error: null }],
        product_aliases: [{ data: null, error: null }], // hasil delete saja
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const res = await PATCH(patchRequest({ aliases: [] }), params());

    expect(res.status).toBe(200);
    const calls = supabase.from.mock.calls as [string][];
    const productAliasesCallCount = calls.filter(
      ([table]) => table === "product_aliases",
    ).length;
    expect(productAliasesCallCount).toBe(1); // delete saja, insert di-skip
  });

  it("404 kalau produk aliases-only tidak ditemukan di tenant staf ini", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [
            { data: { id: "staff-1", business_id: "biz-a", role: "owner" }, error: null },
          ],
          products: [{ data: null, error: null }],
        },
      }),
    );

    const res = await PATCH(patchRequest({ aliases: ["x"] }), params());

    expect(res.status).toBe(404);
  });

  it("500 kalau delete aliases lama gagal — tidak lanjut ke insert", async () => {
    const supabase = createMockSupabase({
      user: { id: "auth-user-1" },
      from: {
        staff: [
          { data: { id: "staff-1", business_id: "biz-a", role: "owner" }, error: null },
        ],
        products: [{ data: { id: "prod-1" }, error: null }],
        product_aliases: [{ data: null, error: { message: "db error" } }],
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const res = await PATCH(patchRequest({ aliases: ["x"] }), params());

    expect(res.status).toBe(500);
    const calls = supabase.from.mock.calls as [string][];
    const productAliasesCallCount = calls.filter(
      ([table]) => table === "product_aliases",
    ).length;
    expect(productAliasesCallCount).toBe(1); // insert tidak sempat dipanggil
  });

  it("500 kalau delete sukses tapi insert aliases baru gagal", async () => {
    const supabase = createMockSupabase({
      user: { id: "auth-user-1" },
      from: {
        staff: [
          { data: { id: "staff-1", business_id: "biz-a", role: "owner" }, error: null },
        ],
        products: [{ data: { id: "prod-1" }, error: null }],
        product_aliases: [
          { data: null, error: null }, // delete sukses
          { data: null, error: { message: "insert gagal" } }, // insert gagal
        ],
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const res = await PATCH(patchRequest({ aliases: ["x"] }), params());

    expect(res.status).toBe(500);
  });
});
