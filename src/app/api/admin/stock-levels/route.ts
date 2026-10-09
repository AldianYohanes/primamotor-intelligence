import { NextRequest, NextResponse } from "next/server";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import {
  buildStockLevelRows,
  type LocationInput,
  type ProductInput,
  type StockInput,
} from "@/src/modules/stock-levels/mappers/mappers";

const BATCH = 1000;
const PRODUCT_COLUMNS = "id, name, part_number, category, unit, min_threshold";
const STOCK_COLUMNS = "product_id, location_id, quantity, reserved_quantity, available_quantity";

/**
 * Stok per lokasi (read-only). Perubahan stok TIDAK lewat sini — UI memakai
 * POST /api/admin/stock-opname supaya semuanya tercatat di ledger.
 * Query terpisah (produk, lokasi, stok) lalu digabung di mapper murni, karena
 * tipe relation embed di repo ini tidak selalu andal.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaffRow("portal.access");
  if ("error" in auth) return auth.error;
  const { supabase, staffRow } = auth;
  const businessId = staffRow.business_id;

  const { page, pageSize, from, to } = parsePagination(req);
  const params = req.nextUrl.searchParams;
  // Karakter ini merusak sintaks filter .or() PostgREST.
  const q = (params.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim();
  const locationId = params.get("location_id") || null;
  const lowOnly = params.get("low_only") === "true";

  try {
    let locQuery = supabase
      .from("locations")
      .select("id, name, type")
      .eq("business_id", businessId)
      .order("name");
    if (locationId) locQuery = locQuery.eq("id", locationId);
    const { data: locData, error: locError } = await locQuery;
    if (locError) throw locError;
    const locations: LocationInput[] = (locData ?? []).map((l) => ({ id: l.id, name: l.name, type: l.type }));

    const baseProducts = () => {
      let query = supabase
        .from("products")
        .select(PRODUCT_COLUMNS, { count: "exact" })
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("name")
        .order("id");
      if (q) query = query.or(`name.ilike.%${q}%,part_number.ilike.%${q}%`);
      return query;
    };
    const locationIds = locations.map((l) => l.id);

    const fetchStock = async (productIds: string[] | null): Promise<StockInput[]> => {
      if (locationIds.length === 0) return [];
      const out: StockInput[] = [];
      for (let start = 0; ; start += BATCH) {
        let query = supabase
          .from("stock")
          .select(STOCK_COLUMNS)
          .eq("business_id", businessId)
          .in("location_id", locationIds)
          .order("product_id")
          .order("location_id")
          .range(start, start + BATCH - 1);
        if (productIds) query = query.in("product_id", productIds);
        const { data, error } = await query;
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < BATCH) break;
      }
      return out;
    };

    if (!lowOnly) {
      const { data: products, error, count } = await baseProducts().range(from, to);
      if (error) throw error;
      const list: ProductInput[] = products ?? [];
      const stock = list.length > 0 ? await fetchStock(list.map((p) => p.id)) : [];
      const rows = buildStockLevelRows(list, locations, stock);
      return NextResponse.json({
        ...buildPaginatedResponse(rows, count, page, pageSize),
        locations,
      });
    }

    // Filter "menipis" bergantung pada total stok, jadi harus dihitung atas
    // semua produk yang cocok sebelum dipaginasi.
    const allProducts: ProductInput[] = [];
    for (let start = 0; ; start += BATCH) {
      const { data, error } = await baseProducts().range(start, start + BATCH - 1);
      if (error) throw error;
      allProducts.push(...(data ?? []));
      if (!data || data.length < BATCH) break;
    }
    const stock = allProducts.length > 0 ? await fetchStock(null) : [];
    const low = buildStockLevelRows(allProducts, locations, stock).filter((r) => r.is_low);
    return NextResponse.json({
      ...buildPaginatedResponse(low.slice(from, to + 1), low.length, page, pageSize),
      locations,
    });
  } catch (error) {
    logger.error("Gagal memuat stok per lokasi", {
      route: "admin/stock-levels",
      business_id: businessId,
      error,
    });
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message ?? "Gagal memuat stok" }, { status: 500 });
  }
}
