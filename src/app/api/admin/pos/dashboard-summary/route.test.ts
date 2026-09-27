import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import { GET } from "./route";

function makeRequest(qs = "") {
  return new NextRequest(`http://localhost/api/admin/pos/dashboard-summary${qs}`);
}

describe("GET /api/admin/pos/dashboard-summary", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    // "Hari ini" dikunci ke tengah hari UTC (bukan tengah malam) supaya
    // pergeseran timezone lokal environment test (mis. WIB = UTC+7) tetap
    // jatuh di tanggal kalender yang sama — bukan mencoba "memperbaiki"
    // ambiguitas timezone route.ts yang memang sudah didokumentasikan di
    // sana sebagai keterbatasan yang ada, cuma menghindari test jadi flaky
    // karenanya.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("menolak request tanpa user (401)", async () => {
    mockCreateClient.mockReturnValue(createMockSupabase({ user: null }));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it("menolak user tanpa baris staff (403)", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: { staff: [{ data: null, error: null }] },
      }),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("menolak param days di luar batas (400) — max 90", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: { staff: [{ data: { business_id: "biz-a" }, error: null }] },
      }),
    );

    const res = await GET(makeRequest("?days=91"));

    expect(res.status).toBe(400);
  });

  it("500 kalau query sales gagal", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [{ data: { business_id: "biz-a" }, error: null }],
          sales: [{ data: null, error: { message: "db down" } }],
          shifts: [{ data: [], error: null }],
        },
      }),
    );

    const res = await GET(makeRequest("?days=7"));

    expect(res.status).toBe(500);
  });

  it("500 kalau query shifts gagal", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [{ data: { business_id: "biz-a" }, error: null }],
          sales: [{ data: [], error: null }],
          shifts: [{ data: null, error: { message: "db down" } }],
        },
      }),
    );

    const res = await GET(makeRequest("?days=7"));

    expect(res.status).toBe(500);
  });

  it("mengagregasi revenue/transaksi hari ini dan trend harian dengan benar", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [{ data: { business_id: "biz-a" }, error: null }],
          sales: [
            {
              data: [
                { total_amount: 100000, created_at: "2026-01-15T09:00:00.000Z", status: "completed" },
                { total_amount: 50000, created_at: "2026-01-15T10:30:00.000Z", status: "completed" },
                { total_amount: 75000, created_at: "2026-01-14T08:00:00.000Z", status: "completed" },
              ],
              error: null,
            },
          ],
          shifts: [
            {
              data: [{ id: "shift-1", staff_id: "s1", location_id: "loc-1", opened_at: "2026-01-15T08:00:00.000Z" }],
              error: null,
            },
          ],
        },
      }),
    );

    const res = await GET(makeRequest("?days=7"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.today_revenue).toBe(150000);
    expect(body.today_transaction_count).toBe(2);
    expect(body.active_shift_count).toBe(1);
    expect(body.trend).toHaveLength(7);

    const todayBucket = body.trend.find((p: { date: string }) => p.date === "2026-01-15");
    const yesterdayBucket = body.trend.find((p: { date: string }) => p.date === "2026-01-14");
    expect(todayBucket).toMatchObject({ revenue: 150000, transaction_count: 2 });
    expect(yesterdayBucket).toMatchObject({ revenue: 75000, transaction_count: 1 });
  });

  it("hari tanpa transaksi tetap muncul di trend dengan revenue 0 (bukan bolong)", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [{ data: { business_id: "biz-a" }, error: null }],
          sales: [{ data: [], error: null }],
          shifts: [{ data: [], error: null }],
        },
      }),
    );

    const res = await GET(makeRequest("?days=7"));
    const body = await res.json();

    expect(body.trend).toHaveLength(7);
    expect(body.trend.every((p: { revenue: number }) => p.revenue === 0)).toBe(true);
    expect(body.active_shift_count).toBe(0);
  });

  it("default days=30 kalau param tidak dikirim", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: {
          staff: [{ data: { business_id: "biz-a" }, error: null }],
          sales: [{ data: [], error: null }],
          shifts: [{ data: [], error: null }],
        },
      }),
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.trend).toHaveLength(30);
  });
});
