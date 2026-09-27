import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { can, HOME_PATH, isRole, PERMISSION_DENIED_MESSAGES, type Permission, type Role } from "@/src/lib/auth/rbac";

/**
 * Satu-satunya tempat membaca "siapa yang login, role apa, tenant mana".
 * Sebelumnya tiap page & Route Handler mengulang query staf + cek role
 * sendiri-sendiri (dan beberapa lupa), sehingga misalnya kasir bisa membuka
 * Portal Admin dan memanggil route service_role.
 */

export const ACTIVE_TENANT_COOKIE = "active_tenant_id";

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

export interface StaffContext {
  userId: string;
  staff: {
    id: string;
    role: Role;
    username: string;
    fullName: string;
  };
  /** Tenant tempat akun staf terdaftar (dipakai untuk re-konfirmasi PIN). */
  ownBusiness: TenantInfo;
  /**
   * Tenant yang datanya sedang dikerjakan. Sama dengan ownBusiness kecuali
   * super admin yang sudah memilih tenant lain lewat /admin/tenants (naskah:
   * wajib pilih tenant aktif sebelum akses LINTAS tenant; tenant sendiri
   * tidak perlu dipilih).
   */
  tenant: TenantInfo | null;
  /** Super admin sedang bekerja di tenant yang bukan miliknya. */
  isForeignTenant: boolean;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export type StaffContextFailure = "unauthenticated" | "no_staff" | "inactive" | "tenant_inactive";

export type StaffContextResult = { ok: true; ctx: StaffContext } | { ok: false; reason: StaffContextFailure };

export const getStaffContext = cache(async (): Promise<StaffContextResult> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, role, username, full_name, business_id, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!staffRow || !isRole(staffRow.role)) return { ok: false, reason: "no_staff" };
  // Migrasi 0034 sudah menolak ini di RLS; dicek lagi supaya tetap aman di DB
  // yang belum menjalankan 0034 dan untuk route yang memakai service_role.
  if (!staffRow.is_active) return { ok: false, reason: "inactive" };

  const { data: own } = await supabase
    .from("businesses")
    .select("id, slug, name, status")
    .eq("id", staffRow.business_id)
    .maybeSingle();
  if (!own || own.status !== "active") return { ok: false, reason: "tenant_inactive" };

  const ownBusiness: TenantInfo = { id: own.id, slug: own.slug, name: own.name };
  const role = staffRow.role;
  let tenant: TenantInfo | null = ownBusiness;

  if (can(role, "tenant.switch")) {
    const selected = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value ?? null;
    if (selected && selected !== ownBusiness.id) {
      const { data: target } = await supabase
        .from("businesses")
        .select("id, slug, name, status")
        .eq("id", selected)
        .maybeSingle();
      if (target && target.status === "active") {
        tenant = { id: target.id, slug: target.slug, name: target.name };
      }
    }
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      staff: { id: staffRow.id, role, username: staffRow.username, fullName: staffRow.full_name },
      ownBusiness,
      tenant,
      isForeignTenant: !!tenant && tenant.id !== ownBusiness.id,
      supabase,
    },
  };
});

/** Konteks yang dijamin punya tenant aktif. */
export type TenantContext = StaffContext & { tenant: TenantInfo };

type RequireOptions = {
  /** Default true. false untuk halaman/route pemilih tenant itu sendiri. */
  requireTenant?: boolean;
};

const FAILURE_MESSAGES: Record<StaffContextFailure, [number, string]> = {
  unauthenticated: [401, "Unauthorized"],
  no_staff: [403, "Akun staf tidak ditemukan"],
  inactive: [403, "Akun staf nonaktif"],
  tenant_inactive: [403, "Toko belum aktif atau sedang dinonaktifkan"],
};

/**
 * Untuk Route Handler. Mengembalikan konteks, atau NextResponse error yang
 * tinggal di-return:
 *
 *   const auth = await requireApi("portal.access");
 *   if (auth instanceof NextResponse) return auth;
 *   const { tenant, staff } = auth;
 */
export async function requireApi(permission: Permission | null): Promise<TenantContext | NextResponse>;
export async function requireApi(
  permission: Permission | null,
  options: { requireTenant: false },
): Promise<StaffContext | NextResponse>;
export async function requireApi(
  permission: Permission | null,
  options: RequireOptions = {},
): Promise<StaffContext | NextResponse> {
  const result = await getStaffContext();
  if (!result.ok) {
    const [status, error] = FAILURE_MESSAGES[result.reason];
    return NextResponse.json({ error }, { status });
  }
  const { ctx } = result;
  if (permission && !can(ctx.staff.role, permission)) {
    return NextResponse.json({ error: PERMISSION_DENIED_MESSAGES[permission] }, { status: 403 });
  }
  if (options.requireTenant !== false && !ctx.tenant) {
    return NextResponse.json(
      { error: "Pilih tenant aktif terlebih dahulu", code: "tenant_not_selected" },
      { status: 409 },
    );
  }
  return ctx;
}

/**
 * Bentuk `{ supabase, staffRow }` yang sudah dipakai Route Handler lama, supaya
 * migrasi ke pemeriksaan terpusat tidak perlu menulis ulang isi tiap route.
 * `business_id`/`business_slug` = tenant AKTIF (bagi super admin bisa tenant
 * lain), bukan tenant tempat akun terdaftar.
 */
export interface ApiStaffRow {
  id: string;
  business_id: string;
  business_slug: string;
  role: Role;
  username: string;
  full_name: string;
}

export async function requireStaffRow(
  permission: Permission | null,
): Promise<
  | { error: NextResponse }
  | { supabase: StaffContext["supabase"]; staffRow: ApiStaffRow; ctx: TenantContext }
> {
  const auth = await requireApi(permission);
  if (auth instanceof NextResponse) return { error: auth };
  return {
    supabase: auth.supabase,
    staffRow: {
      id: auth.staff.id,
      business_id: auth.tenant.id,
      business_slug: auth.tenant.slug,
      role: auth.staff.role,
      username: auth.staff.username,
      full_name: auth.staff.fullName,
    },
    ctx: auth,
  };
}

/**
 * Untuk Server Component / layout. Mengarahkan ke login, ke menu (tidak
 * berizin), atau ke pemilih tenant (super admin belum memilih).
 */
export async function requirePage(permission: Permission | null): Promise<TenantContext>;
export async function requirePage(
  permission: Permission | null,
  options: { requireTenant: false },
): Promise<StaffContext>;
export async function requirePage(
  permission: Permission | null,
  options: RequireOptions = {},
): Promise<StaffContext> {
  const result = await getStaffContext();
  if (!result.ok) {
    redirect(result.reason === "unauthenticated" ? "/login" : `/login?error=${result.reason}`);
  }
  const { ctx } = result;
  if (permission && !can(ctx.staff.role, permission)) redirect(HOME_PATH);
  if (options.requireTenant !== false && !ctx.tenant) redirect("/admin/tenants");
  return ctx;
}
