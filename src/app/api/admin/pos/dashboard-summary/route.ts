import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";

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
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

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

  // Bucket per hari (format YYYY-MM-DD berbasis waktu server/UTC — konsisten
  // dengan `created_at` yang disimpan sebagai timestamptz tanpa konversi
  // timezone eksplisit di tempat lain di codebase ini, mis. shift report).
  const dailyMap = new Map<string, { revenue: number; count: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    dailyMap.set(d.toISOString().slice(0, 10), { revenue: 0, count: 0 });
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  let todayRevenue = 0;
  let todayCount = 0;

  for (const sale of sales) {
    const key = sale.created_at.slice(0, 10);
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
