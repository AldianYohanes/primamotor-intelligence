import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import { WIB_OFFSET_MS } from "@/src/modules/dashboard-summary/utils/overview";

// Agregasi dilakukan di TS (bukan RPC Postgres baru) — data POS baru mulai
// terisi sejak migration 0025, volume per tenant di skala thesis ini masih
// kecil (hitungan ratusan nota/bulan), jadi fetch mentah + group-by di
// server Route Handler cukup dan tidak butuh migration/RPC tambahan untuk
// sekadar dashboard read-only ini. Kalau volume tumbuh besar nanti, ini
// kandidat pertama untuk dipindah ke RPC agregasi (§7 catatan serupa untuk
// agent tools).
const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export async function GET(req: NextRequest) {
  const auth = await requireStaffRow("portal.access");
  if ("error" in auth) return auth.error;
  const { supabase, staffRow } = auth;

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { days } = parsed.data;

  // Ambil cukup jauh ke belakang untuk cover kebutuhan chart 7/30 hari
  // sekaligus (client bisa slice ke 7 hari terakhir tanpa request ulang),
  // tapi query cuma sekali per param `days` yang diminta.
  // Hari dihitung menurut WIB (zona waktu toko), bukan zona server: nota
  // sebelum jam 07.00 WIB tidak lagi masuk ke hari sebelumnya, dan hasilnya
  // sama di server UTC maupun laptop dev berzona WIB.
  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const sinceWib = new Date(
    Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate() - (days - 1)),
  );
  const since = new Date(sinceWib.getTime() - WIB_OFFSET_MS);

  const [salesResult, openShiftsResult] = await Promise.all([
    supabase
      .from("sales")
      .select("total_amount, created_at, status")
      .eq("business_id", staffRow.business_id)
      .eq("status", "completed")
      .gte("created_at", since.toISOString()),
    supabase
      .from("shifts")
      .select("id, staff_id, location_id, opened_at")
      .eq("business_id", staffRow.business_id)
      .eq("status", "open"),
  ]);

  if (salesResult.error) {
    logger.error("Gagal memuat data sales untuk dashboard summary", {
      route: "admin/pos/dashboard-summary",
      business_id: staffRow.business_id,
      error: salesResult.error,
    });
    return NextResponse.json(
      { error: salesResult.error.message },
      { status: 500 },
    );
  }
  if (openShiftsResult.error) {
    logger.error("Gagal memuat data shift aktif untuk dashboard summary", {
      route: "admin/pos/dashboard-summary",
      business_id: staffRow.business_id,
      error: openShiftsResult.error,
    });
    return NextResponse.json(
      { error: openShiftsResult.error.message },
      { status: 500 },
    );
  }

  const sales = salesResult.data ?? [];

  // Bucket per hari (format YYYY-MM-DD menurut WIB).
  const dayKey = (iso: string) =>
    new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
  const dailyMap = new Map<string, { revenue: number; count: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(sinceWib.getTime() + i * 24 * 60 * 60 * 1000);
    dailyMap.set(d.toISOString().slice(0, 10), { revenue: 0, count: 0 });
  }

  const todayKey = nowWib.toISOString().slice(0, 10);
  let todayRevenue = 0;
  let todayCount = 0;

  for (const sale of sales) {
    const key = dayKey(sale.created_at);
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.revenue += sale.total_amount;
      bucket.count += 1;
    }
    if (key === todayKey) {
      todayRevenue += sale.total_amount;
      todayCount += 1;
    }
  }

  const trend = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    revenue: v.revenue,
    transaction_count: v.count,
  }));

  return NextResponse.json({
    today_revenue: todayRevenue,
    today_transaction_count: todayCount,
    active_shift_count: (openShiftsResult.data ?? []).length,
    trend,
  });
}
