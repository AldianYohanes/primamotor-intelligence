import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logging/logger";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

// PENTING (lihat TODO §1 / bekas celah privilege escalation): 'admin' SENGAJA
// tidak boleh settable lewat endpoint ini, sama persis dengan POST
// /api/admin/staff. Ini bukan cuma soal UX form — role 'admin' dianggap
// akun platform/developer (is_super_admin() di DB cuma cek `role = 'admin'`
// TANPA syarat business_id, jadi staf role 'admin' di TENANT MANAPUN otomatis
// jadi super-admin lintas-tenant). Keputusan arsitektur yang diambil: untuk
// skala project saat ini, 'admin' tetap satu enum value yang HANYA boleh
// dibuat lewat akses DB langsung oleh operator platform (Supabase dashboard),
// tidak pernah lewat Route Handler manapun — bukan cuma di sini. Kalau nanti
// kebutuhan platform-admin makin kompleks, pertimbangkan tabel terpisah
// (mis. `platform_admins`) supaya konsep "admin tenant" vs "admin platform"
// tidak berbagi satu enum value lagi. Pembatasan app-layer di sini TIDAK cukup
// sendirian (browser bisa update tabel staff langsung lewat PostgREST); yang
// benar-benar menutupnya adalah trigger + column grant di migrasi 0034.
const updateStaffSchema = z.object({
  role: z.enum(["owner", "staff"]).optional(),
  is_active: z.boolean().optional(),
  full_name: z.string().min(2).optional(),
});

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireFullAccessStaff = (permission: Permission = "staff.manage") => requireStaffRow(permission);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireFullAccessStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = updateStaffSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("staff")
    .update(parsed.data)
    // Scope eksplisit ke tenant pemanggil (defense-in-depth, §10) — jangan
    // cuma andalkan RLS, biar update ke staf tenant lain gagal-aman di sini.
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .select()
    .single();
  if (error) {
    logger.error("Gagal update staf", {
      route: "admin/staff/[id]",
      staff_id: id,
      updated_by_staff_id: staffRow.id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  // RLS (0034) sudah menolak akses data staf nonaktif, tapi sesi & refresh
  // token-nya tetap hidup. Ban di Supabase Auth memutus login ulang dan
  // refresh, termasuk lewat signInWithPassword langsung yang melewati
  // /api/auth/login.
  if (parsed.data.is_active !== undefined) {
    const { error: banError } = await createAdminClient().auth.admin.updateUserById(
      data.auth_user_id,
      { ban_duration: parsed.data.is_active ? "none" : "876000h" },
    );
    if (banError) {
      logger.error("Status staf diperbarui tapi gagal mengubah ban Supabase Auth", {
        route: "admin/staff/[id]",
        staff_id: id,
        is_active: parsed.data.is_active,
        error: banError,
      });
    }
  }
  return NextResponse.json({ staff: data });
}
