import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { isValidPin } from "@/src/lib/auth/synthetic-email";
import { logger } from "@/src/lib/logging/logger";

const resetSchema = z.object({ new_pin: z.string().min(6) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaffRow("staff.manage");
  if ("error" in auth) return auth.error;
  const { supabase, staffRow: requester } = auth;

  const parsed = resetSchema.safeParse(await req.json());
  if (!parsed.success || !isValidPin(parsed.data.new_pin)) {
    return NextResponse.json(
      { error: "PIN baru minimal 6 digit angka" },
      { status: 400 },
    );
  }

  // Target staf harus di tenant yang sama — sebelumnya cuma ditegakkan lewat
  // RLS select (sudah benar secara fungsional), sekarang ditambah scope
  // eksplisit `.eq("business_id", ...)` untuk konsistensi dengan §10:
  // defense-in-depth, jangan cuma andalkan RLS meski RLS-nya sudah benar.
  const { data: targetStaff } = await supabase
    .from("staff")
    .select("id, auth_user_id, role")
    .eq("id", id)
    .eq("business_id", requester.business_id)
    .single();
  if (!targetStaff)
    return NextResponse.json(
      { error: "Staf tidak ditemukan" },
      { status: 404 },
    );
  // PIN diganti lewat service_role, jadi trigger DB tidak ikut menjaga di sini.
  // Tanpa cek ini owner di tenant tempat akun super admin terdaftar bisa
  // mengganti PIN super admin lalu login sebagai super admin.
  if (targetStaff.role === "admin" && requester.role !== "admin") {
    return NextResponse.json(
      { error: "PIN super admin hanya bisa diganti oleh super admin" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(
    targetStaff.auth_user_id,
    {
      password: parsed.data.new_pin,
    },
  );
  if (error) {
    logger.error("Gagal reset PIN staf (updateUserById)", {
      route: "admin/staff/[id]/reset-pin",
      target_staff_id: id,
      requested_by_role: requester.role,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: unlockError } = await admin
    .from("staff")
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq("id", id);
  if (unlockError) {
    // PIN-nya SUDAH berhasil diganti di titik ini — ini cuma gagal membuka
    // lockout lamanya, jadi tidak dianggap gagal total (tetap balas ok), tapi
    // staf bisa jadi masih "terkunci" walau PIN baru sudah benar sampai
    // lockout lama expire sendiri (§8, 15 menit) — worth di-log.
    logger.warn("PIN staf berhasil direset tapi gagal membuka status lockout", {
      route: "admin/staff/[id]/reset-pin",
      target_staff_id: id,
      error: unlockError,
    });
  }

  return NextResponse.json({ ok: true });
}
