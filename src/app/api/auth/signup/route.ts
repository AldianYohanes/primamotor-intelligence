import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { toSyntheticEmail, isValidPin } from "@/src/lib/auth/synthetic-email";
import { slugify, isValidSlug } from "@/src/lib/validation/slug";

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
    await admin.from("businesses").delete().eq("id", business.id);
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
    await admin.auth.admin.deleteUser(authUser.user.id);
    await admin.from("businesses").delete().eq("id", business.id);
    return NextResponse.json(
      { error: "Gagal membuat akun staf owner" },
      { status: 500 },
    );
  }

  // 5. Buat 2 lokasi default (toko + gudang) supaya tenant baru langsung siap pakai setelah di-approve
  await admin.from("locations").insert([
    { business_id: business.id, name: "Toko", type: "toko" },
    { business_id: business.id, name: "Gudang", type: "gudang" },
  ]);

  return NextResponse.json({
    message:
      "Pendaftaran berhasil. Toko Anda menunggu verifikasi admin sebelum bisa digunakan.",
    business_slug: slug,
  });
}
