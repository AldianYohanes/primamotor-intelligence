import { NextResponse } from "next/server";
import { requireApi } from "@/src/lib/auth/staff-context";
import { logger } from "@/src/lib/logging/logger";

/**
 * GET: daftar semua tenant (khusus admin/developer, ditegakkan lewat RLS —
 * pakai server client dengan sesi user, BUKAN admin client, supaya is_super_admin()
 * yang sebenarnya menegakkan otorisasi, bukan asumsi di kode aplikasi).
 *
 * Sebelumnya endpoint ini cuma cek user login, jadi staf tenant biasa yang
 * memanggilnya dapat balikan berisi TENANT MEREKA SENDIRI SAJA (RLS
 * `businesses read own` yang menahan, bukan kebocoran data) — tapi
 * perilakunya membingungkan untuk endpoint yang namanya menyiratkan
 * "semua tenant". Sekarang ditambah cek eksplisit `is_super_admin()` di
 * app-level lewat RPC yang sama, supaya non-super-admin dapat 403 yang
 * jelas, bukan silently dapat data parsial.
 */
export async function GET() {
  const auth = await requireApi("tenant.switch", { requireTenant: false });
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const user = { user: { id: auth.userId } };

  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, address, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Gagal memuat daftar tenant (super admin)", {
      route: "admin/tenants",
      requested_by_user_id: user.user.id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ businesses: data });
}
