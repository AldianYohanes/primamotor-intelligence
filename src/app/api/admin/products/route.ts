import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

const productSchema = z.object({
  part_number: z.string().optional(),
  name: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().default("pcs"),
  description: z.string().optional(),
  min_threshold: z.number().int().min(0).default(0),
  // Dipakai Monitoring Agent (app/api/cron/monitor/route.ts) untuk hitung
  // reorder point per produk — sebelumnya cuma bisa di-set lewat DB langsung,
  // sekarang settable staf lewat form produk (lihat modules/products).
  lead_time_days: z.number().int().min(0).max(365).optional(),
  safety_stock: z.number().int().min(0).optional(),
  unit_cost: z.number().min(0).default(0),
  selling_price: z.number().min(0).default(0),
  preferred_supplier_id: z.string().uuid().optional(),
  aliases: z.array(z.string()).optional(),
  // Migration 0028 — null/undefined = garansi tidak dilacak utk produk ini
  // (default). Dipakai fitur klaim garansi POS (lihat modul pos-sales).
  warranty_days: z.number().int().min(0).max(3650).optional(),
});

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireStaff = (permission: Permission = "portal.access") => requireStaffRow(permission);

// Whitelist kolom yang boleh disortir — mencegah nama kolom sembarangan diteruskan
// mentah-mentah ke query builder Supabase (bukan cuma soal SQL injection, tapi juga
// supaya tidak membocorkan nama kolom internal yang tidak dimaksudkan untuk publik).
const SORTABLE_COLUMNS = [
  "name",
  "part_number",
  "category",
  "selling_price",
  "unit_cost",
  "min_threshold",
  "created_at",
] as const;
type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortableColumn(value: string | null): value is SortableColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

// GET: list produk milik tenant (RLS otomatis membatasi). Mendukung server-side
// pagination (?page=&pageSize=), search (?q=), sort (?sortBy=&sortDir=), dan
// filter status (?status=active|inactive|all) — dirancang untuk dikonsumsi
// TanStack Table dengan manualPagination/manualSorting/manualFiltering.
export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;

  const q = req.nextUrl.searchParams.get("q");
  const sortByParam = req.nextUrl.searchParams.get("sortBy");
  const sortDir =
    req.nextUrl.searchParams.get("sortDir") === "desc" ? "desc" : "asc";
  const status = req.nextUrl.searchParams.get("status"); // 'active' | 'inactive' | 'all'
  const { page, pageSize, from, to } = parsePagination(req);

  const sortBy: SortableColumn = isSortableColumn(sortByParam)
    ? sortByParam
    : "name";

  let query = supabase
    .from("products")
    // §15.4 — join product_aliases supaya form edit tahu alias yang sudah ada
    // tanpa request terpisah per produk (list ini sudah di-paginate, jumlah
    // baris per halaman kecil).
    .select("*, suppliers(name), product_aliases(alias)", { count: "exact" })
    .order(sortBy, { ascending: sortDir === "asc" })
    .range(from, to);

  if (q) query = query.ilike("name", `%${q}%`);
  if (status === "active") query = query.eq("is_active", true);
  else if (status === "inactive") query = query.eq("is_active", false);
  // default (tidak dikirim / 'all'): tidak difilter is_active sama sekali

  const { data, error, count } = await query;
  if (error) {
    logger.error("Gagal memuat daftar produk", {
      route: "admin/products",
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    buildPaginatedResponse(data ?? [], count, page, pageSize),
  );
}

// POST: buat produk baru (RLS: hanya full_access — admin/owner)
export async function POST(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = productSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { aliases, ...productData } = parsed.data;

  const { data: product, error } = await supabase
    .from("products")
    .insert({ ...productData, business_id: staffRow.business_id })
    .select()
    .single();

  if (error) {
    logger.error("Gagal membuat produk baru", {
      route: "admin/products",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  if (aliases && aliases.length > 0 && product) {
    const { error: aliasError } = await supabase.from("product_aliases").insert(
      aliases.filter(Boolean).map((alias) => ({
        product_id: product.id,
        alias,
        source: "admin_input",
      })),
    );
    if (aliasError) {
      // Produk utamanya SUDAH berhasil dibuat — aliases itu data pelengkap
      // (bantu pencarian getStock Query Agent), jadi tidak dianggap gagal total,
      // tapi tetap perlu ke-log supaya ketahuan aliases-nya belum lengkap.
      logger.error("Produk berhasil dibuat tapi gagal menyimpan aliases", {
        route: "admin/products",
        business_id: staffRow.business_id,
        product_id: product.id,
        error: aliasError,
      });
    }
  }

  return NextResponse.json({ product });
}
