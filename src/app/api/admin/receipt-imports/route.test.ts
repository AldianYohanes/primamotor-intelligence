import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabase } from "../../../../test-utils/mock-supabase";

// requireStaff() di route.ts panggil createClient() dari sini — mock supaya
// tidak butuh koneksi Supabase sungguhan untuk unit test logika route.
const mockCreateClient = vi.fn();
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));
// POST butuh createAdminClient (upload storage) — tidak dites di sini
// (fokus §15.1 ada di GET), tapi harus di-mock supaya import route.ts tidak
// pecah.
vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
// Otorisasi terpusat membaca identitas dari mock Supabase yang sama.
vi.mock("@/src/lib/auth/staff-context", async () =>
  (await import("../../../../test-utils/mock-staff-context")).createStaffContextMock(() => mockCreateClient()),
);
vi.mock("@/src/lib/logging/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/src/lib/ocr/gemini", () => ({
  extractReceiptWithGemini: vi.fn(),
}));
vi.mock("@/src/lib/rate-limit/ocr-rate-limit", () => ({
  checkOcrRateLimit: vi.fn(),
}));

import { GET } from "./route";

function makeRequest(qs = "") {
  return new NextRequest(`http://localhost/api/admin/receipt-imports${qs}`);
}

describe("GET /api/admin/receipt-imports (§15.1)", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
  });

  it("menolak request tanpa user terautentikasi (401) — ini yang sebelumnya TIDAK terjadi sebelum fix §15.1", async () => {
    mockCreateClient.mockReturnValue(createMockSupabase({ user: null }));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it("menolak user yang login tapi tidak punya baris staff (403)", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "auth-user-1" },
        from: { staff: [{ data: null, error: null }] },
      }),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("§15.1 — memfilter eksplisit .eq('business_id', <tenant staf yang login>), bukan cuma andalkan RLS", async () => {
    const supabase = createMockSupabase({
      user: { id: "auth-user-1" },
      from: {
        staff: [{ data: { id: "staff-1", business_id: "biz-a" }, error: null }],
        receipt_imports: [{ data: [{ id: "ri-1" }], error: null, count: 1 }],
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([{ id: "ri-1" }]);

    // Bukti langsung §15.1: kalau requireStaff() TIDAK dipanggil (versi lama
    // yang bug), `staff` tidak pernah ke-query dan test 401/403 di atas juga
    // akan gagal duluan. Assertion di bawah ini yang membuktikan filter
    // tenant benar-benar terpasang di query, bukan cuma "berhasil 200".
    const calls = supabase.from.mock.calls as [string][];
    const receiptImportsCallIndex = calls.findIndex(
      ([table]) => table === "receipt_imports",
    );
    const receiptImportsBuilder =
      supabase.from.mock.results[receiptImportsCallIndex].value;
    expect(receiptImportsBuilder.eq).toHaveBeenCalledWith(
      "business_id",
      "biz-a",
    );
  });

  it("mengembalikan 500 dan tetap log kalau query Supabase error (bukan gagal diam-diam, §11)", async () => {
    const supabase = createMockSupabase({
      user: { id: "auth-user-1" },
      from: {
        staff: [{ data: { id: "staff-1", business_id: "biz-a" }, error: null }],
        receipt_imports: [
          { data: null, error: { message: "db down" }, count: null },
        ],
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
  });
});
