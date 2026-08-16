import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toSyntheticEmail, isValidPin } from "@/src/lib/auth/synthetic-email";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { logger } from "@/src/lib/logging/logger";

const createStaffSchema = z.object({
  username: z
    .string()
    .min(3)
    .regex(
      /^[a-z0-9_.]+$/i,
      "Username hanya boleh huruf, angka, titik, underscore",
    ),
  full_name: z.string().min(2),
  role: z.enum(["owner", "staff"]), // 'admin' (developer) sengaja tidak bisa dibuat lewat form ini
  pin: z.string().min(6),
});

async function requireFullAccessStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, business_id, role, businesses(slug)")
    .eq("auth_user_id", user.id)
    .single();
  if (!staffRow)
    return {
      error: NextResponse.json(
        { error: "Akun staf tidak ditemukan" },
        { status: 403 },
      ),
    } as const;
  if (staffRow.role !== "owner" && staffRow.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Hanya owner/admin yang boleh mengelola staf" },
        { status: 403 },
      ),
    } as const;
  }
  return { supabase, staffRow } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await requireFullAccessStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;

  const { page, pageSize, from, to } = parsePagination(req);

  const { data, error, count } = await supabase
    .from("staff")
    .select(
      "id, username, full_name, role, is_active, locked_until, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    logger.error("Gagal memuat daftar staf", {
      route: "admin/staff",
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    buildPaginatedResponse(data ?? [], count, page, pageSize),
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireFullAccessStaff();
  if ("error" in ctx) return ctx.error;
  const { staffRow } = ctx;

  const parsed = createStaffSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { username, full_name, role, pin } = parsed.data;
  if (!isValidPin(pin))
    return NextResponse.json(
      { error: "PIN minimal 6 digit angka" },
      { status: 400 },
    );

  // @ts-expect-error -- bentuk join Supabase (businesses adalah object tunggal di relasi many-to-one)
  const businessSlug: string = staffRow.businesses.slug;

  const admin = createAdminClient();
  const email = toSyntheticEmail(businessSlug, username);

  const { data: authUser, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
    });
  if (authError || !authUser.user) {
    logger.error("Gagal membuat auth user untuk staf baru", {
      route: "admin/staff",
      business_id: staffRow.business_id,
      created_by_staff_id: staffRow.id,
      error: authError,
    });
    return NextResponse.json(
      { error: authError?.message ?? "Gagal membuat akun" },
      { status: 500 },
    );
  }

  const { data: newStaff, error: staffError } = await admin
    .from("staff")
    .insert({
      business_id: staffRow.business_id,
      auth_user_id: authUser.user.id,
      username: username.trim().toLowerCase(),
      full_name,
      role,
    })
    .select()
    .single();

  if (staffError) {
    // Auth user SUDAH terbuat di titik ini — kalau insert staff gagal, kita
    // rollback manual dengan deleteUser supaya tidak nyisa auth.users tanpa
    // pasangan staff row (bisa bikin username kepakai "hantu" di percobaan
    // signup berikutnya). Rollback ini sendiri bisa gagal (mis. race/network),
    // makanya juga di-log terpisah — kalau gagal, orphan auth user itu perlu
    // dibersihkan manual dari Supabase dashboard.
    const { error: rollbackError } = await admin.auth.admin.deleteUser(
      authUser.user.id,
    );
    logger.error("Gagal insert staff row setelah auth user dibuat — rollback dijalankan", {
      route: "admin/staff",
      business_id: staffRow.business_id,
      created_by_staff_id: staffRow.id,
      auth_user_id: authUser.user.id,
      rollback_succeeded: !rollbackError,
      error: staffError,
    });
    if (rollbackError) {
      logger.error("Rollback deleteUser JUGA gagal — ada orphan auth user, perlu dibersihkan manual", {
        route: "admin/staff",
        business_id: staffRow.business_id,
        auth_user_id: authUser.user.id,
        error: rollbackError,
      });
    }
    return NextResponse.json({ error: staffError.message }, { status: 422 });
  }

  return NextResponse.json({ staff: newStaff });
}
