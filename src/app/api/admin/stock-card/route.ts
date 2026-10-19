import { NextRequest, NextResponse } from "next/server";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import {
  buildStockCard,
  endExclusiveWib,
  startOfDayWib,
} from "@/src/modules/stock-card/mappers/mappers";
import type { StockTransactionInput } from "@/src/modules/stock-card/data/response";

const BATCH = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kartu stok satu produk (read-only) dari ledger stock_transactions. Saldo
 * berjalan dihitung dari seluruh riwayat produk ini (bukan hanya periode yang
 * dipilih) supaya saldo awal periode benar. Transaksi dari chat agent ditandai
 * lewat agent_audit_log_id.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaffRow("portal.access");
  if ("error" in auth) return auth.error;
  const { supabase, staffRow } = auth;
  const businessId = staffRow.business_id;

  const params = req.nextUrl.searchParams;
  const productId = params.get("product_id") ?? "";
  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ error: "product_id wajib diisi" }, { status: 400 });
  }
  const locationId = params.get("location_id") || null;
  if (locationId && !UUID_RE.test(locationId)) {
    return NextResponse.json({ error: "location_id tidak valid" }, { status: 400 });
  }
  const fromIso = startOfDayWib(params.get("from"));
  const toIso = endExclusiveWib(params.get("to"));
  const { page, pageSize, from, to } = parsePagination(req);

  try {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, part_number, unit")
      .eq("id", productId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) {
      return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
    }

    const { data: locData, error: locError } = await supabase
      .from("locations")
      .select("id, name")
      .eq("business_id", businessId)
      .order("name");
    if (locError) throw locError;
    const locations = locData ?? [];

    const transactions: StockTransactionInput[] = [];
    for (let start = 0; ; start += BATCH) {
      const { data, error } = await supabase
        .from("stock_transactions")
        .select("id, location_id, transaction_type, quantity, notes, staff_id, agent_audit_log_id, created_at")
        .eq("business_id", businessId)
        .eq("product_id", productId)
        .order("created_at")
        .order("id")
        .range(start, start + BATCH - 1);
      if (error) throw error;
      transactions.push(...(data ?? []));
      if (!data || data.length < BATCH) break;
    }

    const staffIds = Array.from(
      new Set(transactions.map((t) => t.staff_id).filter((id): id is string => !!id)),
    );
    const { data: staffRows, error: staffError } =
      staffIds.length > 0
        ? await supabase.from("staff").select("id, full_name").in("id", staffIds)
        : { data: [] as { id: string; full_name: string }[], error: null };
    if (staffError) throw staffError;

    const { rows, summary } = buildStockCard(transactions, {
      locationId,
      fromIso,
      toIso,
      locationNames: new Map(locations.map((l) => [l.id, l.name])),
      staffNames: new Map((staffRows ?? []).map((s) => [s.id, s.full_name])),
    });

    return NextResponse.json({
      ...buildPaginatedResponse(rows.slice(from, to + 1), rows.length, page, pageSize),
      product,
      locations,
      summary,
    });
  } catch (error) {
    logger.error("Gagal memuat kartu stok", {
      route: "admin/stock-card",
      business_id: businessId,
      product_id: productId,
      error,
    });
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message ?? "Gagal memuat kartu stok" }, { status: 500 });
  }
}
