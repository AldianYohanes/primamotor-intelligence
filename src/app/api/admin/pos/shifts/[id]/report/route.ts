import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeShiftReportTotals } from "@/src/lib/pos/shift-report";
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
 * "X report" — snapshot laporan shift SAAT INI tanpa menutup shift, boleh
 * dipanggil berkali-kali kapan saja selama shift masih terbuka (mis. kasir
 * mau cek kas tengah hari tanpa mengakhiri shift-nya). Endpoint yang sama
 * dipakai secara internal oleh POST .../close untuk menghasilkan "Z report"
 * final — angkanya konsisten karena satu fungsi perhitungan (computeShiftReportTotals).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;
  const { id } = await params;

  const { data: shift, error: shiftError } = await supabase
    .from("shifts")
    .select("id, business_id, location_id, staff_id, opening_cash, closing_cash, expected_cash, cash_variance, status, opened_at, closed_at, locations(name), staff(full_name)")
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();

  if (shiftError) {
    logger.error("Gagal memuat shift POS untuk laporan", {
      route: "admin/pos/shifts/[id]/report",
      business_id: staffRow.business_id,
      shift_id: id,
      error: shiftError,
    });
    return NextResponse.json({ error: shiftError.message }, { status: 500 });
  }
  if (!shift) return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 });

  const isManager = staffRow.role === "owner" || staffRow.role === "admin";
  if (!isManager && shift.staff_id !== staffRow.id) {
    return NextResponse.json({ error: "Kamu hanya bisa lihat laporan shift milikmu sendiri" }, { status: 403 });
  }

  const totals = await computeShiftReportTotals(supabase, {
    businessId: staffRow.business_id,
    staffId: shift.staff_id,
    locationId: shift.location_id,
    openingCash: shift.opening_cash,
    fromISO: shift.opened_at,
    toISO: shift.closed_at ?? new Date().toISOString(),
  });

  return NextResponse.json({ shift, totals });
}
