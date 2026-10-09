import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireApi = vi.fn();
const reconfirmPin = vi.fn();
const rpc = vi.fn();
const auditRow = vi.fn();
const conversationRow = vi.fn();

vi.mock("@/src/lib/auth/staff-context", () => ({
  requireApi: (...args: unknown[]) => requireApi(...args),
}));
vi.mock("@/src/lib/auth/confirm-pin", () => ({
  reconfirmPin: (...args: unknown[]) => reconfirmPin(...args),
}));
vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => (table === "agent_audit_log" ? auditRow() : conversationRow()),
          }),
        }),
      }),
    }),
    rpc: (...args: unknown[]) => rpc(...args),
  }),
}));
vi.mock("@/src/lib/logging/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "./route";

const AUDIT_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";

// Skema masih mewajibkan field identitas di body; route harus mengabaikannya.
const LEGACY_IDENTITY = {
  staff_id: "22222222-2222-4222-8222-222222222222",
  business_slug: "toko-b",
  username: "orang-lain",
};

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/agent/tools/update-stock/confirm", {
    method: "POST",
    body: JSON.stringify({ ...LEGACY_IDENTITY, ...body }),
  });
}

const session = {
  staff: { id: "staff-session", username: "kasir1" },
  ownBusiness: { slug: "toko-a" },
  tenant: { id: "biz-a" },
};

describe("POST /api/agent/tools/update-stock/confirm", () => {
  beforeEach(() => {
    requireApi.mockReset().mockResolvedValue(session);
    reconfirmPin.mockReset().mockResolvedValue({ ok: true });
    rpc.mockReset().mockResolvedValue({ data: { ok: true, transaction_id: "txn-1" }, error: null });
    auditRow.mockReset().mockResolvedValue({ data: { id: AUDIT_ID, conversation_id: CONVERSATION_ID } });
    conversationRow.mockReset().mockResolvedValue({ data: { staff_id: "staff-session" } });
  });

  it("menolak tanpa sesi dan tidak memeriksa PIN maupun memanggil RPC", async () => {
    requireApi.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const res = await POST(request({ audit_log_id: AUDIT_ID, pin: "123456" }));

    expect(res.status).toBe(401);
    expect(reconfirmPin).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("menolak PIN salah tanpa memanggil RPC", async () => {
    reconfirmPin.mockResolvedValue({ ok: false, status: 401, error: "PIN salah", attempts: 1 });

    const res = await POST(request({ audit_log_id: AUDIT_ID, pin: "000000" }));

    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("menolak audit log milik tenant lain (404) tanpa memanggil RPC", async () => {
    auditRow.mockResolvedValue({ data: null });

    const res = await POST(request({ audit_log_id: AUDIT_ID, pin: "123456" }));

    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("menolak konfirmasi oleh staf yang bukan pengusul (403) walau PIN-nya benar", async () => {
    conversationRow.mockResolvedValue({ data: { staff_id: "staff-lain" } });

    const res = await POST(request({ audit_log_id: AUDIT_ID, pin: "123456" }));

    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("menolak audit log tanpa percakapan atau dengan percakapan yang tidak ditemukan (403)", async () => {
    auditRow.mockResolvedValue({ data: { id: AUDIT_ID, conversation_id: null } });
    expect((await POST(request({ audit_log_id: AUDIT_ID, pin: "123456" }))).status).toBe(403);

    auditRow.mockResolvedValue({ data: { id: AUDIT_ID, conversation_id: CONVERSATION_ID } });
    conversationRow.mockResolvedValue({ data: null });
    expect((await POST(request({ audit_log_id: AUDIT_ID, pin: "123456" }))).status).toBe(403);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("menolak konfirmasi ulang transaksi yang sudah tidak pending (409)", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "not_pending", status: "confirmed" }, error: null });

    const res = await POST(request({ audit_log_id: AUDIT_ID, pin: "123456" }));

    expect(res.status).toBe(409);
  });

  it("memakai identitas dari sesi, bukan dari body", async () => {
    const res = await POST(request({ audit_log_id: AUDIT_ID, pin: "123456" }));

    expect(res.status).toBe(200);
    expect(reconfirmPin).toHaveBeenCalledWith("toko-a", "kasir1", "123456");
    expect(rpc).toHaveBeenCalledWith("confirm_update_stock", {
      p_audit_log_id: AUDIT_ID,
      p_staff_id: "staff-session",
    });
  });
});
