import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { toSyntheticEmail, isValidPin } from "@/src/lib/auth/synthetic-email";
import { slugify, isValidSlug } from "@/src/lib/validation/slug";
import { logger } from "@/src/lib/logging/logger";

/**
 * Self-service signup (keputusan produk Ronde 3 #3): siapa pun bisa mendaftarkan
 * bisnis baru, tapi business dibuat dengan status 'pending_verification' dan TIDAK
 * bisa dipakai login (lihat app/api/auth/login) sampai admin (developer) approve
 * lewat Admin Web App (POST /api/admin/tenants/[id]/approve, RPC approve_business_signup).
 *
 * Akun pertama yang dibuat otomatis berrole 'owner' — pemilik bisnis, full access
 * dalam tenant-nya sendiri begitu tenant di-approve.
 */
const signupSchema = z.object({
  business_name: z.string().min(2, "Nama bisnis minimal 2 karakter"),
  business_address: z.string().optional(),
  owner_username: z
    .string()
    .min(3, "Username minimal 3 karakter")
    .regex(
      /^[a-z0-9_.]+$/i,
      "Username hanya boleh huruf, angka, titik, underscore",
    ),
  owner_full_name: z.string().min(2),
  pin: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const parsed = signupSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const {
    business_name,
    business_address,
    owner_username,
    owner_full_name,
    pin,
  } = parsed.data;

  if (!isValidPin(pin)) {
    return NextResponse.json(
      { error: "PIN minimal 6 digit angka" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 1. Buat slug unik dari nama bisnis
  const baseSlug = slugify(business_name);
  if (!isValidSlug(baseSlug)) {
    return NextResponse.json(
      { error: "Nama bisnis menghasilkan slug tidak valid, coba nama lain" },
      { status: 400 },
    );
  }

  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const { data: existing } = await admin
      .from("businesses")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
    if (suffix > 50) {
      logger.error("Gagal membuat slug unik untuk signup (>50 percobaan)", {
        route: "auth/signup",
        base_slug: baseSlug,
      });
      return NextResponse.json(
        { error: "Gagal membuat slug unik, coba nama bisnis lain" },
        { status: 500 },
      );
    }
  }

  // 2. Insert business (pending_verification) — service role, sesuai RLS 0019
  const { data: business, error: businessError } = await admin
    .from("businesses")
    .insert({
      name: business_name,
      slug,
      address: business_address ?? null,
      status: "pending_verification",
    })
    .select()
    .single();

  if (businessError || !business) {
    logger.error("Gagal insert business baru saat signup", {
      route: "auth/signup",
      slug,
      error: businessError,
    });
    return NextResponse.json(
      { error: "Gagal membuat bisnis baru" },
      { status: 500 },
    );
  }

  // 3. Buat auth user (synthetic email) via admin API
  const email = toSyntheticEmail(slug, owner_username);
  const { data: authUser, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
    });

  if (authError || !authUser.user) {
    // rollback business supaya tidak ada tenant "yatim" tanpa owner
    const { error: rollbackError } = await admin
      .from("businesses")
      .delete()
      .eq("id", business.id);
    logger.error(
      "Gagal membuat auth user owner saat signup — rollback business dijalankan",
      {
        route: "auth/signup",
        business_id: business.id,
        slug,
        rollback_succeeded: !rollbackError,
        error: authError,
      },
    );
    if (rollbackError) {
      logger.error("Rollback delete business JUGA gagal — ada business_id yatim", {
        route: "auth/signup",
        business_id: business.id,
        error: rollbackError,
      });
    }
    return NextResponse.json(
      { error: authError?.message ?? "Gagal membuat akun owner" },
      { status: 500 },
    );
  }

  // 4. Insert staff (role owner)
  const { error: staffError } = await admin.from("staff").insert({
    business_id: business.id,
    auth_user_id: authUser.user.id,
    username: owner_username.trim().toLowerCase(),
    full_name: owner_full_name,
    role: "owner",
  });

  if (staffError) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(
      authUser.user.id,
    );
    const { error: deleteBusinessError } = await admin
      .from("businesses")
      .delete()
      .eq("id", business.id);
    logger.error(
      "Gagal insert staff owner saat signup — rollback auth user + business dijalankan",
      {
        route: "auth/signup",
        business_id: business.id,
        auth_user_id: authUser.user.id,
        rollback_auth_succeeded: !deleteUserError,
        rollback_business_succeeded: !deleteBusinessError,
        error: staffError,
      },
    );
    if (deleteUserError || deleteBusinessError) {
      logger.error("Rollback signup TIDAK lengkap — ada data yatim, perlu dibersihkan manual", {
        route: "auth/signup",
        business_id: business.id,
        auth_user_id: authUser.user.id,
        delete_user_error: deleteUserError,
        delete_business_error: deleteBusinessError,
      });
    }
    return NextResponse.json(
      { error: "Gagal membuat akun staf owner" },
      { status: 500 },
    );
  }

  // 5. Buat 2 lokasi default (toko + gudang) supaya tenant baru langsung siap pakai setelah di-approve
  const { error: locationsError } = await admin.from("locations").insert([
    { business_id: business.id, name: "Toko", type: "toko" },
    { business_id: business.id, name: "Gudang", type: "gudang" },
  ]);
  if (locationsError) {
    // Tenant & owner-nya SUDAH berhasil dibuat — lokasi default cuma kemudahan
    // awal (staf masih bisa bikin lokasi manual dari admin setelah approve),
    // jadi tidak di-rollback, cukup dicatat.
    logger.error("Signup berhasil tapi gagal membuat lokasi default", {
      route: "auth/signup",
      business_id: business.id,
      error: locationsError,
    });
  }

  return NextResponse.json({
    message:
      "Pendaftaran berhasil. Toko Anda menunggu verifikasi admin sebelum bisa digunakan.",
    business_slug: slug,
  });
}
