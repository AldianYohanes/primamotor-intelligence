import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { logger } from "@/src/lib/logging/logger";

/**
 * car_models adalah tabel referensi BERSAMA lintas tenant, tanpa business_id
 * (§3.0/§10) — read terbuka untuk semua authenticated user, tulis cuma
 * super_admin (RLS "car_models write super_admin only"). TIDAK ada
 * requireStaff() di sini karena tidak butuh business_id staf sama sekali —
 * cukup pastikan user login (RLS "read all authenticated" yang jaga sisanya).
 * TIDAK ada POST/PATCH/DELETE handler — kalau ditambah nanti untuk kebutuhan
 * super-admin, RLS akan tetap menolak staf tenant biasa, tapi endpoint tulis
 * belum ada sama sekali di iterasi ini (di luar cakupan: butuh alur super-admin
 * terpisah, bukan sekadar cek role di Route Handler tenant biasa).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { page, pageSize, from, to } = parsePagination(req);
  const q = req.nextUrl.searchParams.get("q");

  let query = supabase
    .from("car_models")
    .select("*", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error, count } = await query;
  if (error) {
    logger.error("Gagal memuat car_models", {
      route: "admin/car-models",
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    buildPaginatedResponse(data ?? [], count, page, pageSize),
  );
}
