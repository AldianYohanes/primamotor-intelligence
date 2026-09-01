import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

const closeShiftSchema = z.object({
  closing_cash: z.number().min(0),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Tutup shift ("Z report") — kunci angka final: hitung expected_cash &
 * cash_variance (closing_cash - expected_cash) SEKALI di sini, simpan
 * permanen di baris shifts, closed_at diisi now(). Setelah ditutup, shift
 * tidak bisa dibuka/diubah lagi (tidak ada endpoint reopen — kalau salah
 * input closing_cash, itu perlu koreksi manual oleh admin/owner langsung di
 * DB, sengaja tidak disediakan endpoint reopen supaya angka Z report tetap
 * jadi catatan final yang tepercaya).
 *
 * Boleh ditutup oleh staf pemilik shift SENDIRI, atau admin/owner (mis. shift
 * supervisor menutupkan shift kasir yang lupa/sudah pulang).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;
  const { id } = await params;

  const parsed = closeShiftSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: shift } = await supabase
    .from("shifts")
    .select("id, business_id, location_id, staff_id, opening_cash, status, opened_at")
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();

  if (!shift) return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 });

  const isManager = staffRow.role === "owner" || staffRow.role === "admin";
  if (!isManager && shift.staff_id !== staffRow.id) {
    return NextResponse.json({ error: "Kamu hanya bisa menutup shift milikmu sendiri" }, { status: 403 });
  }
  if (shift.status === "closed") {
    return NextResponse.json({ error: "Shift ini sudah ditutup sebelumnya" }, { status: 409 });
  }

  const closedAt = new Date().toISOString();
  const totals = await computeShiftReportTotals(supabase, {
    businessId: staffRow.business_id,
    staffId: shift.staff_id,
    locationId: shift.location_id,
    openingCash: shift.opening_cash,
    fromISO: shift.opened_at,
    toISO: closedAt,
  });

  const cashVariance = parsed.data.closing_cash - totals.expectedCash;

  const admin = createAdminClient();
  // `.eq("status", "open")` di sini BUKAN sekadar filter — ini guard anti
  // race condition (ditemukan saat audit): tanpa ini, dua request POST
  // .../close yang hampir bersamaan (double-klik, retry jaringan) bisa
  // sama-sama lolos pengecekan status di atas (yang cuma SELECT biasa tanpa
  // lock), lalu keduanya UPDATE — request KEDUA menimpa angka Z report dari
  // request PERTAMA tanpa error apa pun. Dengan guard ini, kalau baris sudah
  // tidak berstatus 'open' lagi (sudah ditutup oleh request lain), UPDATE ini
  // match 0 baris dan `.single()` di bawah akan gagal dengan jelas — request
  // kedua dapat error, bukan diam-diam menimpa.
  const { data: updated, error } = await admin
    .from("shifts")
    .update({
      closing_cash: parsed.data.closing_cash,
      expected_cash: totals.expectedCash,
      cash_variance: cashVariance,
      status: "closed",
      closed_at: closedAt,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id, location_id, staff_id, opening_cash, closing_cash, expected_cash, cash_variance, status, opened_at, closed_at, notes")
    .single();

  if (error) {
    // PGRST116 = "no rows returned" dari .single() — kemungkinan besar race
    // condition di atas (shift baru saja ditutup request lain), bukan error
    // infra. Pesan ramah, tidak perlu di-log sebagai error.
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Shift ini baru saja ditutup (kemungkinan dari perangkat/klik lain)" }, { status: 409 });
    }
    logger.error("Gagal menutup shift POS", {
      route: "admin/pos/shifts/[id]/close",
      business_id: staffRow.business_id,
      shift_id: id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shift: updated, totals });
}
