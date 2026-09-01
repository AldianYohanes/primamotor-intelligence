import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

const querySchema = z.object({
  location_id: z.string().uuid(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Endpoint khusus terminal POS — beda dari GET /api/admin/products (yang untuk
 * modul manajemen produk & butuh pagination lengkap). Di sini kasir cuma perlu
 * "cari cepat, lihat stok di lokasi ini, klik tambah ke keranjang" — hasil
 * dibatasi (limit) dan SELALU disertai available_quantity di lokasi yang dipilih,
 * bukan stok agregat semua lokasi.
 *
 * Tanpa `q`: kembalikan produk aktif terbaru/nama A-Z (buat kasir browse tanpa
 * ketik). Dengan `q`: pakai RPC search_products yang sudah ada (sama seperti
 * tool getStock di chat agent) supaya pencarian by nama/alias/part_number
 * konsisten satu sumber, tidak reimplement logic pencarian baru di sini.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { location_id, q, limit } = parsed.data;

  // Defense in depth — lokasi memang sudah difilter RLS, tapi validasi eksplisit
  // di sini memastikan error 404 yang jelas alih-alih "stock kosong" yang ambigu.
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("id", location_id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();
  if (!location) {
    return NextResponse.json({ error: "Lokasi tidak ditemukan" }, { status: 404 });
  }

  let productIds: string[] | null = null;

  if (q) {
    const { data: matches, error: searchError } = await supabase.rpc("search_products", {
      p_business_id: staffRow.business_id,
      p_query: q,
      p_limit: limit,
    });
    if (searchError) {
      logger.error("RPC search_products gagal (pos/products)", {
        route: "admin/pos/products",
        business_id: staffRow.business_id,
        query: q,
        error: searchError,
      });
      return NextResponse.json({ error: searchError.message }, { status: 500 });
    }
    productIds = (matches ?? []).map((m) => m.product_id);
    if (productIds.length === 0) return NextResponse.json({ results: [] });
  }

  let productsQuery = supabase
    .from("products")
    .select("id, name, part_number, unit, selling_price")
    .eq("business_id", staffRow.business_id)
    .eq("is_active", true);

  productsQuery = productIds
    ? productsQuery.in("id", productIds)
    : productsQuery.order("name", { ascending: true }).limit(limit);

  const { data: products, error: productsError } = await productsQuery;
  if (productsError) {
    logger.error("Query products gagal (pos/products)", {
      route: "admin/pos/products",
      business_id: staffRow.business_id,
      error: productsError,
    });
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }
  if (!products || products.length === 0) return NextResponse.json({ results: [] });

  const { data: stockRows, error: stockError } = await supabase
    .from("stock")
    .select("product_id, available_quantity")
    .eq("location_id", location_id)
    .in(
      "product_id",
      products.map((p) => p.id),
    );
  if (stockError) {
    logger.error("Query stock gagal (pos/products)", {
      route: "admin/pos/products",
      business_id: staffRow.business_id,
      location_id,
      error: stockError,
    });
    return NextResponse.json({ error: stockError.message }, { status: 500 });
  }

  // Kompatibilitas model mobil (product_model_compatibility + car_models, tabel
  // referensi bersama lintas tenant — sama seperti /api/admin/car-models, read
  // terbuka untuk semua authenticated user lewat RLS, tidak butuh admin client).
  // Ditampilkan di terminal kasir supaya kasir bisa cek/verifikasi kecocokan
  // sebelum jual — relevan karena domainnya spesifik spare part Volvo, bukan
  // retail generik.
  const { data: compatRows, error: compatError } = await supabase
    .from("product_model_compatibility")
    .select("product_id, car_models(brand, name, year_start, year_end)")
    .in(
      "product_id",
      products.map((p) => p.id),
    );
  if (compatError) {
    // Non-fatal — kompatibilitas cuma informasi tambahan di UI, gagal ambil
    // ini tidak boleh menggagalkan seluruh pencarian produk. Tetap di-log
    // karena bisa jadi indikasi masalah query/skema.
    logger.warn("Query product_model_compatibility gagal (pos/products), lanjut tanpa data kompatibilitas", {
      route: "admin/pos/products",
      business_id: staffRow.business_id,
      error: compatError,
    });
  }

  const compatByProduct = new Map<string, string[]>();
  for (const row of compatRows ?? []) {
    // @ts-expect-error -- bentuk join Supabase, car_models adalah objek tunggal (many-to-one)
    const model = row.car_models;
    if (!model) continue;
    const yearRange = model.year_start && model.year_end ? ` (${model.year_start}-${model.year_end})` : "";
    const label = `${model.brand} ${model.name}${yearRange}`;
    const list = compatByProduct.get(row.product_id) ?? [];
    list.push(label);
    compatByProduct.set(row.product_id, list);
  }

  const stockByProduct = new Map((stockRows ?? []).map((s) => [s.product_id, s.available_quantity]));

  // Urutan hasil pencarian (relevansi dari search_products) tetap dijaga —
  // productIds sudah terurut relevansi, products dari .in() TIDAK menjamin
  // urutan itu, jadi disusun ulang di sini kalau q ada.
  const ordered = productIds
    ? productIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
    : products;

  return NextResponse.json({
    results: ordered.map((p) => ({
      id: p.id,
      name: p.name,
      part_number: p.part_number,
      unit: p.unit,
      selling_price: p.selling_price,
      available_quantity: stockByProduct.get(p.id) ?? 0,
      compatible_models: compatByProduct.get(p.id) ?? [],
    })),
  });
}
