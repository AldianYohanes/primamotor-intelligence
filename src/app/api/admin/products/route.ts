import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { logger } from "@/src/lib/logging/logger";

const productSchema = z.object({
  part_number: z.string().optional(),
  name: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().default("pcs"),
  description: z.string().optional(),
  min_threshold: z.number().int().min(0).default(0),
  unit_cost: z.number().min(0).default(0),
  selling_price: z.number().min(0).default(0),
  preferred_supplier_id: z.string().uuid().optional(),
  aliases: z.array(z.string()).optional(),
});

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
    .select("*, suppliers(name)", { count: "exact" })
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
      aliases
        .filter(Boolean)
        .map((alias) => ({
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
