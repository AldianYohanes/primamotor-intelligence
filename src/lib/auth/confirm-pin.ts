import { createAdminClient } from "@/lib/supabase/admin";
import {
  toSyntheticEmail,
  isValidPin,
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from "@/src/lib/auth/synthetic-email";

type ConfirmResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Re-verifikasi PIN sebelum eksekusi aksi berisiko (updateStock/transferStock).
 * Memanggil signInWithPassword ulang dengan admin client (bukan endpoint /api/auth/login
 * terpisah) supaya lockout policy yang sama otomatis berlaku juga di sini — sesuai §5
 * dokumentasi backend: "panggil ulang endpoint ini dengan kredensial yang sama".
 *
 * Tidak mengubah cookie sesi (staf tetap login dengan sesi awalnya) — ini murni
 * verifikasi identitas, bukan re-login.
 */
export async function reconfirmPin(
  businessSlug: string,
  username: string,
  pin: string,
): Promise<ConfirmResult> {
  if (!isValidPin(pin)) {
    return { ok: false, status: 400, error: "PIN minimal 6 digit angka" };
  }

  const admin = createAdminClient();

  const { data: business } = await admin
    .from("businesses")
    .select("id, status")
    .eq("slug", businessSlug)
    .single();
  if (!business || business.status !== "active") {
    return {
      ok: false,
      status: 404,
      error: "Toko tidak ditemukan atau tidak aktif",
    };
  }

  const { data: staffRow } = await admin
    .from("staff")
    .select("id, locked_until, failed_login_attempts, is_active")
    .eq("business_id", business.id)
    .eq("username", username.trim().toLowerCase())
    .single();

  if (!staffRow || !staffRow.is_active) {
    return {
      ok: false,
      status: 401,
      error: "Akun tidak ditemukan atau nonaktif",
    };
  }
  if (staffRow.locked_until && new Date(staffRow.locked_until) > new Date()) {
    return {
      ok: false,
      status: 423,
      error: "Akun terkunci sementara akibat percobaan PIN gagal",
    };
  }

  const email = toSyntheticEmail(businessSlug, username);
  const { error } = await admin.auth.signInWithPassword({
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
    return { ok: false, status: 401, error: "PIN salah" };
  }

  await admin
    .from("staff")
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq("id", staffRow.id);
  return { ok: true };
}
