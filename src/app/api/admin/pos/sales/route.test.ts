import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabase } from "../../../../../test-utils/mock-supabase";

const mockCreateClient = vi.fn();
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));
vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/src/lib/auth/staff-context", async () =>
  (await import("../../../../../test-utils/mock-staff-context")).createStaffContextMock(() => mockCreateClient()),
);
vi.mock("@/src/lib/logging/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "./route";

const req = () => new NextRequest("http://localhost/api/admin/pos/sales");

describe("GET /api/admin/pos/sales", () => {
  beforeEach(() => mockCreateClient.mockReset());

  it("menolak kasir (role staff) dengan 403", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "u1" },
        from: { staff: [{ data: { id: "s1", business_id: "biz-a", role: "staff" }, error: null }] },
      }),
    );
    expect((await GET(req())).status).toBe(403);
  });

  it("owner tetap boleh (200)", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabase({
        user: { id: "u1" },
        from: {
          staff: [{ data: { id: "s1", business_id: "biz-a", role: "owner" }, error: null }],
          sales: [{ data: [], error: null, count: 0 }],
        },
      }),
    );
    expect((await GET(req())).status).toBe(200);
  });
});
