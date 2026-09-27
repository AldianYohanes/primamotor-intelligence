import { NextResponse } from "next/server";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";

/**
 * Daftar lokasi tenant aktif untuk asisten chat (pemilihan lokasi transaksi).
 * business_id selalu dari sesi, tidak pernah dari query string.
 */
export async function GET() {
  const auth = await requireStaffRow("chat.use");
  if ("error" in auth) return auth.error;
  const { supabase, staffRow } = auth;

  const { data, error } = await supabase
    .from("locations")
    .select("id, name, type, latitude, longitude")
    .eq("business_id", staffRow.business_id)
    .order("name", { ascending: true });

  if (error) {
    logger.error("Gagal memuat lokasi untuk agent", {
      route: "agent/tools/locations",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ locations: data ?? [] });
}
