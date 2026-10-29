import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { updateSession } from "@/src/lib/supabase/middleware";

const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

describe("updateSession untuk API tanpa sesi", () => {
  it("membalas 401 JSON, bukan pengalihan ke halaman login", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } });
    const res = await updateSession(req("/api/agent/tools/get-stock?query=radiator"));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).error).toMatch(/Sesi/);
  });

  it("membalas 503 bila Supabase Auth tidak terjangkau sesaat", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0 } });
    const res = await updateSession(req("/api/admin/pos/sales"));
    expect(res.status).toBe(503);
  });

  it("halaman biasa tanpa sesi tetap dialihkan ke /login", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await updateSession(req("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("API publik (login) lolos tanpa sesi", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await updateSession(req("/api/auth/login"));
    expect(res.status).toBe(200);
  });

  it("API dengan sesi lolos", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    const res = await updateSession(req("/api/admin/pos/sales"));
    expect(res.status).toBe(200);
  });
});
