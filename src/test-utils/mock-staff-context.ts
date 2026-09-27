import { NextResponse } from "next/server";
import { can, isRole, PERMISSION_DENIED_MESSAGES, type Permission } from "@/src/lib/auth/rbac";

/**
 * Pengganti `@/src/lib/auth/staff-context` untuk unit test Route Handler.
 * Modul aslinya butuh `server-only`, `next/headers` (cookie tenant aktif), dan
 * query `businesses`; di sini identitas cukup dibaca dari mock Supabase yang
 * sama (antrean `staff`), sehingga fixture test lama tetap berlaku:
 * user null → 401, baris staf null → 403, role tanpa izin → 403.
 * Baris staf tanpa `role` dianggap owner (fixture lama tidak menyertakannya).
 *
 * Pemakaian (factory vi.mock harus lazy karena di-hoist):
 *   vi.mock("@/src/lib/auth/staff-context", async () =>
 *     (await import("<path>/test-utils/mock-staff-context")).createStaffContextMock(() => mockCreateClient()));
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export function createStaffContextMock(getClient: () => AnyClient) {
  async function resolve(permission: Permission | null) {
    const supabase = getClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    const { data: staff } = await supabase.from("staff").select("*").eq("auth_user_id", user.id).maybeSingle();
    if (!staff) return { error: NextResponse.json({ error: "Akun staf tidak ditemukan" }, { status: 403 }) };
    const role = isRole(staff.role) ? staff.role : "owner";
    if (permission && !can(role, permission)) {
      return { error: NextResponse.json({ error: PERMISSION_DENIED_MESSAGES[permission] }, { status: 403 }) };
    }
    const tenant = { id: staff.business_id, slug: staff.business_slug ?? "toko", name: "Toko" };
    const ctx = {
      userId: user.id,
      staff: { id: staff.id, role, username: staff.username ?? "staf", fullName: staff.full_name ?? "Staf" },
      ownBusiness: tenant,
      tenant,
      isForeignTenant: false,
      supabase,
    };
    return {
      supabase,
      ctx,
      staffRow: {
        id: staff.id,
        business_id: staff.business_id,
        business_slug: tenant.slug,
        role,
        username: ctx.staff.username,
        full_name: ctx.staff.fullName,
      },
    };
  }

  return {
    ACTIVE_TENANT_COOKIE: "active_tenant_id",
    requireStaffRow: (permission: Permission | null) => resolve(permission),
    requireApi: async (permission: Permission | null) => {
      const r = await resolve(permission);
      return "error" in r ? r.error : r.ctx;
    },
  };
}
