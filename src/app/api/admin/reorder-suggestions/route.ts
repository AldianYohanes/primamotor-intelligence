import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
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

const SUGGESTION_STATUSES = [
  "pending",
  "acknowledged",
  "ordered",
  "dismissed",
] as const;
type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
function isSuggestionStatus(value: string | null): value is SuggestionStatus {
  return !!value && (SUGGESTION_STATUSES as readonly string[]).includes(value);
}

/**
 * GET: riwayat LENGKAP saran restock dari Monitoring Agent (semua status),
 * bukan cuma 'pending' seperti widget dashboard (app/(admin)/admin/page.tsx)
 * yang sengaja dibiarkan apa adanya (ringkasan cepat) — endpoint ini untuk
 * halaman riwayat, dengan filter status & pagination.
 *
 * Monitoring Agent BUKAN LLM (lihat §6 project instructions) — jangan
 * dikira ini "keputusan AI", ini murni heuristik cron yang menulis baris ke
 * sini via app/api/agent/tools/create-reorder-suggestion (proteksi CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const statusParam = req.nextUrl.searchParams.get("status");
  const { page, pageSize, from, to } = parsePagination(req);

  let query = supabase
    .from("reorder_suggestions")
    .select("*, products(name), suppliers(name)", { count: "exact" })
    .eq("business_id", staffRow.business_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (isSuggestionStatus(statusParam)) query = query.eq("status", statusParam);

  const { data: suggestions, error, count } = await query;
  if (error) {
    logger.error("Gagal memuat reorder suggestions", {
      route: "admin/reorder-suggestions",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const acknowledgedByIds = Array.from(
    new Set(
      (suggestions ?? [])
        .map((s) => s.acknowledged_by)
        .filter((id): id is string => !!id),
    ),
  );

  const { data: staffRows } =
    acknowledgedByIds.length > 0
      ? await supabase
          .from("staff")
          .select("id, full_name")
          .in("id", acknowledgedByIds)
      : { data: [] as { id: string; full_name: string }[] };
  const staffMap = new Map((staffRows ?? []).map((s) => [s.id, s.full_name]));

  const enriched = (suggestions ?? []).map((s) => ({
    ...s,
    acknowledged_by_name: s.acknowledged_by
      ? (staffMap.get(s.acknowledged_by) ?? null)
      : null,
  }));

  return NextResponse.json(
    buildPaginatedResponse(enriched, count, page, pageSize),
  );
}
