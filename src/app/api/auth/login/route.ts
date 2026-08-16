import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  toSyntheticEmail,
  isValidPin,
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from "@/src/lib/auth/synthetic-email";

const loginSchema = z.object({
  business_slug: z.string().min(1),
  username: z.string().min(1),
  pin: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const parsed = loginSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { business_slug, username, pin } = parsed.data;

  if (!isValidPin(pin)) {
    return NextResponse.json(
      { error: "PIN minimal 6 digit angka" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 1. Cari business & pastikan aktif (bukan pending_verification/suspended/rejected)
  const { data: business } = await admin
    .from("businesses")
    .select("id, status")
    .eq("slug", business_slug)
    .single();

  if (!business) {
    return NextResponse.json(
      { error: "Toko tidak ditemukan" },
      { status: 404 },
    );
  }
  if (business.status === "pending_verification") {
    return NextResponse.json(
      { error: "Pendaftaran toko masih menunggu verifikasi admin" },
      { status: 403 },
    );
  }
  if (business.status !== "active") {
    return NextResponse.json(
      { error: "Akses toko ini sedang tidak aktif" },
      { status: 403 },
    );
  }

  // 2. Cari staf & cek lockout
  const { data: staffRow } = await admin
    .from("staff")
    .select("id, locked_until, failed_login_attempts, is_active")
    .eq("business_id", business.id)
    .eq("username", username.trim().toLowerCase())
    .single();

  if (!staffRow || !staffRow.is_active) {
    return NextResponse.json(
      { error: "Akun tidak ditemukan atau nonaktif" },
      { status: 401 },
    );
  }
  if (staffRow.locked_until && new Date(staffRow.locked_until) > new Date()) {
    const minutesLeft = Math.ceil(
      (new Date(staffRow.locked_until).getTime() - Date.now()) / 60000,
    );
    return NextResponse.json(
      {
        error: `Akun terkunci sementara, coba lagi dalam ${minutesLeft} menit`,
      },
      { status: 423 },
    );
  }

  // 3. Coba login pakai synthetic email lewat client server (supaya cookie sesi langsung terpasang)
  const email = toSyntheticEmail(business_slug, username);
  const supabase = await createClient();
  const { data: session, error } = await supabase.auth.signInWithPassword({
    email,
    password: pin,
  });

  if (error) {
    const attempts = staffRow.failed_login_attempts + 1;
    const locked = attempts >= LOCKOUT_MAX_ATTEMPTS;
    await admin
      .from("staff")
      .update({
        failed_login_attempts: attempts,
        locked_until: locked
          ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
          : null,
      })
      .eq("id", staffRow.id);

    return NextResponse.json(
      {
        error: locked
          ? "Username atau PIN salah. Akun dikunci 15 menit setelah 5x percobaan gagal."
          : `Username atau PIN salah (percobaan ke-${attempts} dari ${LOCKOUT_MAX_ATTEMPTS})`,
      },
      { status: 401 },
    );
  }

  await admin
    .from("staff")
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq("id", staffRow.id);

  return NextResponse.json({ user: session.user });
}
