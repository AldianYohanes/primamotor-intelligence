import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import {
  buildLowStock,
  buildMonthlySales,
  buildTopProducts,
  monthRangeStartUtc,
  type LowStockProductInput,
  type LowStockStockInput,
  type SaleItemInput,
} from "@/src/modules/dashboard-summary/utils/overview";

// Sumber data: tabel POS `sales` (status completed) + `sale_items`, sama
// dengan grafik tren harian di /api/admin/pos/dashboard-summary, jadi angka
// bulanan dan harian di dashboard konsisten. Agregasi di TS (bukan RPC baru)
// karena volume per tenant masih kecil; tidak butuh migration.
const querySchema = z.object({
  months: z.coerce.number().int().min(1).max(12).default(6),
  top_days: z.coerce.number().int().min(1).max(90).default(30),
  top_limit: z.coerce.number().int().min(1).max(20).default(5),
  low_limit: z.coerce.number().int().min(1).max(50).default(8),
});

const BATCH = 1000;
const ID_CHUNK = 200;

function fail(label: string, businessId: string, error: unknown) {
  logger.error(label, {
    route: "admin/dashboard/overview",
    business_id: businessId,
    error,
  });
  const message =
    error instanceof Error
      ? error.message
      : (error as { message?: string })?.message;
  return NextResponse.json({ error: message ?? label }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await requireStaffRow("portal.access");
  if ("error" in auth) return auth.error;
  const { supabase, staffRow } = auth;
  const businessId = staffRow.business_id;

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { months, top_days, top_limit, low_limit } = parsed.data;

  const now = new Date();
  const monthsStart = monthRangeStartUtc(now, months);
  const topSince = new Date(now.getTime() - top_days * 24 * 60 * 60 * 1000);
  // Satu query nota cukup untuk grafik bulanan dan terlaris: ambil dari yang
  // lebih awal di antara keduanya.
  const salesSince = topSince < monthsStart ? topSince : monthsStart;

  try {
    const salesAll: {
      id: string;
      total_amount: number;
      created_at: string;
    }[] = [];
    for (let start = 0; ; start += BATCH) {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total_amount, created_at")
        // Filter tenant eksplisit: RLS mengizinkan super admin membaca semua
        // tenant, jadi tanpa ini angkanya tercampur data toko lain.
        .eq("business_id", businessId)
        .eq("status", "completed")
        .gte("created_at", salesSince.toISOString())
        .order("created_at")
        .range(start, start + BATCH - 1);
      if (error) throw error;
      salesAll.push(...(data ?? []));
      if (!data || data.length < BATCH) break;
    }

    const monthly = buildMonthlySales(
      salesAll.filter((s) => new Date(s.created_at) >= monthsStart),
      now,
      months,
    );

    const topSaleIds = salesAll
      .filter((s) => new Date(s.created_at) >= topSince)
      .map((s) => s.id);
    const items: SaleItemInput[] = [];
    for (let i = 0; i < topSaleIds.length; i += ID_CHUNK) {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, quantity, subtotal")
        .eq("business_id", businessId)
        .in("sale_id", topSaleIds.slice(i, i + ID_CHUNK));
      if (error) throw error;
      items.push(...(data ?? []));
    }
    const topAgg = buildTopProducts(items, top_limit);

    const lowProducts: LowStockProductInput[] = [];
    for (let start = 0; ; start += BATCH) {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, part_number, unit, min_threshold")
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("id")
        .range(start, start + BATCH - 1);
      if (error) throw error;
      lowProducts.push(...(data ?? []));
      if (!data || data.length < BATCH) break;
    }
    const stock: LowStockStockInput[] = [];
    for (let start = 0; ; start += BATCH) {
      const { data, error } = await supabase
        .from("stock")
        .select("product_id, quantity, reserved_quantity, available_quantity")
        .eq("business_id", businessId)
        .order("product_id")
        .order("location_id")
        .range(start, start + BATCH - 1);
      if (error) throw error;
      stock.push(...(data ?? []));
      if (!data || data.length < BATCH) break;
    }
    const lowAll = buildLowStock(lowProducts, stock);

    // Nama produk terlaris: produk bisa sudah nonaktif, jadi ambil terpisah
    // dari daftar stok menipis.
    const nameById = new Map<string, string>();
    if (topAgg.length > 0) {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("business_id", businessId)
        .in(
          "id",
          topAgg.map((t) => t.product_id),
        );
      if (error) throw error;
      for (const p of data ?? []) nameById.set(p.id, p.name);
    }

    return NextResponse.json({
      monthly,
      top_products: topAgg.map((t) => ({
        ...t,
        name: nameById.get(t.product_id) ?? "Produk tidak dikenal",
      })),
      top_days,
      low_stock: lowAll.slice(0, low_limit),
      low_stock_total: lowAll.length,
    });
  } catch (error) {
    return fail("Gagal memuat ringkasan dashboard", businessId, error);
  }
}
