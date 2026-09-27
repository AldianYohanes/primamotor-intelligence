import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVE_TENANT_COOKIE, requireApi } from "@/src/lib/auth/staff-context";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { logger } from "@/src/lib/logging/logger";

const bodySchema = z.object({ business_id: z.string().uuid() });

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 12 * 60 * 60,
};

async function logAccess(adminStaffId: string, businessId: string | null, action: "enter" | "leave") {
  const { error } = await createAdminClient()
    .from("tenant_access_log")
    .insert({ admin_staff_id: adminStaffId, business_id: businessId, action });
  if (error) {
    logger.error("Gagal mencatat tenant_access_log", {
      route: "admin/active-tenant",
      admin_staff_id: adminStaffId,
      business_id: businessId ?? undefined,
      action,
      error,
    });
  }
}

/**
 * Super admin memilih tenant aktif (naskah bab 3: wajib memilih tenant aktif
 * sebelum akses lintas tenant). Pilihan disimpan di cookie httpOnly dan
 * dibaca getStaffContext(); peralihan dicatat di tenant_access_log.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApi("tenant.switch", { requireTenant: false });
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const { data: business } = await auth.supabase
    .from("businesses")
    .select("id, name, status")
    .eq("id", parsed.data.business_id)
    .maybeSingle();
  if (!business || business.status !== "active") {
    return NextResponse.json({ error: "Tenant tidak ditemukan atau belum aktif" }, { status: 404 });
  }

  await logAccess(auth.staff.id, business.id, "enter");
  const res = NextResponse.json({ ok: true, tenant: { id: business.id, name: business.name } });
  res.cookies.set(ACTIVE_TENANT_COOKIE, business.id, COOKIE_OPTIONS);
  return res;
}

export async function DELETE() {
  const auth = await requireApi("tenant.switch", { requireTenant: false });
  if (auth instanceof NextResponse) return auth;

  await logAccess(auth.staff.id, auth.tenant?.id ?? null, "leave");
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACTIVE_TENANT_COOKIE);
  return res;
}
