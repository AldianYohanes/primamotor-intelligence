import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabase } from "../../../../../test-utils/mock-supabase";

const mockCreateClient = vi.fn();
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));
vi.mock("@/src/lib/auth/staff-context", async () =>
  (await import("../../../../../test-utils/mock-staff-context")).createStaffContextMock(() => mockCreateClient()),
);
vi.mock("@/src/lib/logging/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "./route";

function makeRequest(qs = "") {
  return new NextRequest(`http://localhost/api/admin/dashboard/overview${qs}`);
}

const staff = [{ data: { business_id: "biz-a" }, error: null }];

describe("GET /api/admin/dashboard/overview", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T05:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("401 tanpa user", async () => {
    mockCreateClient.mockReturnValue(createMockSupabase({ user: null }));
    expect((await GET(makeRequest())).status).toBe(401);
  });

  it("403 tanpa baris staff", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "u1" },
        from: { staff: [{ data: null, error: null }] },
      }),
    );
    expect((await GET(makeRequest())).status).toBe(403);
  });

  it("400 kalau months di luar batas", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({ user: { id: "u1" }, from: { staff } }),
    );
    expect((await GET(makeRequest("?months=13"))).status).toBe(400);
  });

  it("500 kalau query sales gagal", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "u1" },
        from: { staff, sales: [{ data: null, error: { message: "db down" } }] },
      }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db down");
  });

  it("mengembalikan penjualan bulanan, terlaris, dan stok menipis", async () => {
    const client = createMockSupabase({
      user: { id: "u1" },
      from: {
        staff,
        sales: [
          {
            data: [
              { id: "s1", total_amount: 100000, created_at: "2026-03-10T05:00:00.000Z" },
              { id: "s2", total_amount: 50000, created_at: "2026-02-10T05:00:00.000Z" },
            ],
            error: null,
          },
        ],
        sale_items: [
          {
            data: [
              { product_id: "p1", quantity: 3, subtotal: 90000 },
              { product_id: "p2", quantity: 1, subtotal: 10000 },
              { product_id: "p1", quantity: 2, subtotal: 60000 },
            ],
            error: null,
          },
        ],
        products: [
          {
            data: [
              { id: "p1", name: "Oli", part_number: null, unit: "pcs", min_threshold: 5 },
              { id: "p2", name: "Kampas", part_number: "K1", unit: "set", min_threshold: 2 },
            ],
            error: null,
          },
          { data: [{ id: "p1", name: "Oli" }, { id: "p2", name: "Kampas" }], error: null },
        ],
        stock: [
          {
            data: [
              { product_id: "p1", quantity: 2, reserved_quantity: 0, available_quantity: 2 },
              { product_id: "p2", quantity: 9, reserved_quantity: 0, available_quantity: 9 },
            ],
            error: null,
          },
        ],
      },
    });
    mockCreateClient.mockReturnValue(client);

    const res = await GET(makeRequest("?months=3&top_limit=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.monthly).toEqual([
      { month: "2026-01", revenue: 0, transaction_count: 0 },
      { month: "2026-02", revenue: 50000, transaction_count: 1 },
      { month: "2026-03", revenue: 100000, transaction_count: 1 },
    ]);
    expect(body.top_products).toEqual([
      { product_id: "p1", quantity: 5, revenue: 150000, name: "Oli" },
    ]);
    expect(body.low_stock).toHaveLength(1);
    expect(body.low_stock[0]).toMatchObject({ product_id: "p1", available_quantity: 2, min_threshold: 5 });
    expect(body.low_stock_total).toBe(1);
  });
});
