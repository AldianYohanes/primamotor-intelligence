import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/src/lib/auth/staff-context";
import { reconfirmPin } from "@/src/lib/auth/confirm-pin";
import { pinFailureBody } from "@/src/lib/auth/lockout-messages";
import { isValidPin } from "@/src/lib/auth/synthetic-email";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { logger } from "@/src/lib/logging/logger";

const changePinSchema = z.object({
  current_pin: z.string().min(1),
  new_pin: z.string().min(6),
});

/**
 * Staf mengganti PIN-nya sendiri (panel Account). Berbeda dari
 * /api/admin/staff/[id]/reset-pin yang dipakai owner tanpa PIN lama: di sini
 * PIN lama wajib benar, lewat reconfirmPin supaya lockout 5x/15 menit ikut
 * berlaku (mencegah tebak PIN dari perangkat yang tertinggal dalam keadaan login).
 */
export async function POST(req: NextRequest) {
  const auth = await requireApi(null, { requireTenant: false });
  if (auth instanceof NextResponse) return auth;

  const parsed = changePinSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !isValidPin(parsed.data.new_pin)) {
    return NextResponse.json({ error: "PIN baru minimal 6 digit angka" }, { status: 400 });
  }
  const { current_pin, new_pin } = parsed.data;
  if (current_pin === new_pin) {
    return NextResponse.json({ error: "PIN baru harus berbeda dari PIN lama" }, { status: 400 });
  }

  const check = await reconfirmPin(auth.ownBusiness.slug, auth.staff.username, current_pin);
  if (!check.ok) {
    // "PIN salah. Sisa N percobaan…" → "PIN lama salah. Sisa N percobaan…"
    const body = pinFailureBody(check);
    return NextResponse.json(
      { ...body, error: body.error.replace(/^PIN salah/, "PIN lama salah") },
      { status: check.status },
    );
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(auth.userId, {
    password: new_pin,
  });
  if (error) {
    logger.error("Gagal mengganti PIN sendiri", {
      route: "account/pin",
      staff_id: auth.staff.id,
      error,
    });
    return NextResponse.json({ error: "Gagal menyimpan PIN baru" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
