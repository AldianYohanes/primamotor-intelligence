import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/src/lib/logging/logger";

async function requireStaff() {
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
    .select("id, business_id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!staffRow)
    return {
      error: NextResponse.json(
        { error: "Akun staf tidak ditemukan" },
        { status: 403 },
      ),
    } as const;
  return { supabase, staffRow } as const;
}

/**
 * Staf non-admin/owner cuma lihat shift MILIKNYA SENDIRI (buat cek status
 * shift-nya sendiri di terminal); admin/owner bisa lihat semua shift tenant
 * (buat monitoring lintas kasir). `?status=open` untuk cek "apakah saya
 * sedang punya shift terbuka" saat terminal POS dibuka.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const status = req.nextUrl.searchParams.get("status");
  const locationId = req.nextUrl.searchParams.get("location_id");
  // `mine=true` MEMAKSA filter ke staff_id milik pemanggil, terlepas dari
  // role — dipakai widget status shift di terminal POS (§ "shift saya sedang
  // terbuka atau tidak"). Tanpa parameter ini, admin/owner otomatis lihat
  // SEMUA shift tenant (buat halaman riwayat admin) — kalau widget terminal
  // ikut memakai default itu, admin/owner yang pegang kasir sendiri bisa
  // salah ambil shift MILIK STAF LAIN di lokasi yang sama (bug nyata yang
  // ditemukan saat audit — jangan hapus parameter ini).
  const mineOnly = req.nextUrl.searchParams.get("mine") === "true";
  const isManager = staffRow.role === "owner" || staffRow.role === "admin";

  let query = supabase
    .from("shifts")
    .select("id, location_id, staff_id, opening_cash, closing_cash, expected_cash, cash_variance, status, opened_at, closed_at, locations(name), staff(full_name)")
    .order("opened_at", { ascending: false })
    .limit(50);

  if (!isManager || mineOnly) query = query.eq("staff_id", staffRow.id);
  if (status) query = query.eq("status", status);
  if (locationId) query = query.eq("location_id", locationId);

  const { data, error } = await query;
  if (error) {
    logger.error("Gagal memuat daftar shift POS", {
      route: "admin/pos/shifts",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shifts: data ?? [] });
}

const openShiftSchema = z.object({
  location_id: z.string().uuid(),
  opening_cash: z.number().min(0),
});

/**
 * Staf hanya bisa buka shift utk DIRINYA SENDIRI (staff_id selalu dari
 * staffRow, tidak pernah dari body) — konsisten dengan pola business_id di
 * seluruh route admin (§4). Dibatasi DB (unique index migration 0029), bukan
 * cuma dicek di sini, supaya race condition dua klik cepat tidak lolos.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = openShiftSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("id", parsed.data.location_id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();
  if (!location) {
    return NextResponse.json({ error: "Lokasi tidak ditemukan di tenant ini" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shifts")
    .insert({
      business_id: staffRow.business_id,
      location_id: parsed.data.location_id,
      staff_id: staffRow.id,
      opening_cash: parsed.data.opening_cash,
      status: "open",
    })
    .select("id, location_id, staff_id, opening_cash, status, opened_at")
    .single();

  if (error) {
    // Kode 23505 = unique_violation (Postgres) — kemungkinan besar dari
    // shifts_one_open_per_staff_location, bukan bug infra, jadi pesan ramah
    // alih-alih 500 generik. Selain itu tetap di-log sebagai error.
    if (error.code === "23505") {
      return NextResponse.json({ error: "Kamu sudah punya shift terbuka di lokasi ini" }, { status: 409 });
    }
    logger.error("Gagal membuka shift POS", {
      route: "admin/pos/shifts",
      business_id: staffRow.business_id,
      staff_id: staffRow.id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shift: data }, { status: 201 });
}
