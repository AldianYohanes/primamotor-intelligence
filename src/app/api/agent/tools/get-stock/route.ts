import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow, type StaffContext } from "@/src/lib/auth/staff-context";
import { dedupeResults } from "@/src/lib/agents/product-resolution";

const querySchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// Skor tetap untuk hasil cadangan: cukup tinggi agar tidak dianggap "mirip rendah"
// oleh prompt, dan sama rata sehingga beberapa hasil berakhir sebagai pilihan staf.
const WORD_MATCH_SCORE = 0.5;

/**
 * Cadangan bila search_products (trigram, ambang 0,3) kosong: kata umum yang
 * pendek seperti "lampu" terlalu tidak mirip dengan nama panjang ("Lampu
 * Belakang Kiri Depo") walau jelas terkandung di dalamnya (Run 30, T-15).
 * Setiap kata (≥ 3 huruf) harus muncul di nama barang atau salah satu aliasnya.
 */
async function searchByWords(
  supabase: StaffContext["supabase"],
  businessId: string,
  query: string,
  limit: number,
) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[%_\\]/g, ""))
    .filter((w) => w.length >= 3);
  if (words.length === 0) return [];

  let byName = supabase
    .from("products")
    .select("id, name, part_number")
    .eq("business_id", businessId)
    .eq("is_active", true);
  for (const w of words) byName = byName.ilike("name", `%${w}%`);
  const { data: named } = await byName.limit(limit);

  let byAlias = supabase.from("product_aliases").select("product_id");
  for (const w of words) byAlias = byAlias.ilike("alias", `%${w}%`);
  const { data: aliased } = await byAlias.limit(limit);
  const extraIds = (aliased ?? [])
    .map((a) => a.product_id)
    .filter((id) => !(named ?? []).some((p) => p.id === id));
  const { data: viaAlias } = extraIds.length
    ? await supabase
        .from("products")
        .select("id, name, part_number")
        .in("id", extraIds)
        .eq("business_id", businessId)
        .eq("is_active", true)
    : { data: [] };

  return [...(named ?? []), ...(viaAlias ?? [])].slice(0, limit).map((p) => ({
    product_id: p.id,
    name: p.name,
    part_number: p.part_number,
    matched_via: "words",
    similarity_score: WORD_MATCH_SCORE,
  }));
}

/**
 * Read-only, tidak butuh HITL. Dipanggil Query Agent & Transaction Agent (untuk
 * konfirmasi product_id sebelum updateStock/transferStock).
 *
 * Pakai server client dengan sesi staf yang login — RLS otomatis membatasi ke
 * tenant staf tersebut lewat auth_business_id(), tidak mengandalkan business_id
 * dari query string sama sekali (mencegah staf toko A mengintip stok toko B).
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaffRow("chat.use");
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

  const { data: rawMatches, error: searchError } = await supabase.rpc(
    "search_products",
    {
      p_business_id: staffRow.business_id,
      p_query: parsed.data.query,
      p_limit: parsed.data.limit,
    },
  );

  if (searchError) {
    logger.error("RPC search_products gagal (tool getStock)", {
      route: "agent/tools/get-stock",
      business_id: staffRow.business_id,
      query: parsed.data.query,
      error: searchError,
    });
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }
  // Satu produk bisa cocok lewat nama dan beberapa alias sekaligus; model
  // cukup melihatnya sekali (dengan skor terbaik).
  let matches = dedupeResults(rawMatches ?? []);
  if (matches.length === 0) {
    matches = await searchByWords(supabase, staffRow.business_id, parsed.data.query, parsed.data.limit);
  }
  if (matches.length === 0)
    return NextResponse.json({ results: [] });

  const productIds = matches.map((m) => m.product_id);
  const { data: stockRows, error: stockError } = await supabase
    .from("stock")
    .select(
      "product_id, location_id, quantity, reserved_quantity, available_quantity, locations(name, type)",
    )
    .in("product_id", productIds);

  if (stockError) {
    logger.error("Query stock gagal (tool getStock)", {
      route: "agent/tools/get-stock",
      business_id: staffRow.business_id,
      error: stockError,
    });
    return NextResponse.json({ error: stockError.message }, { status: 500 });
  }

  const results = matches.map((product) => ({
    ...product,
    stock_by_location: (stockRows ?? [])
      .filter((s) => s.product_id === product.product_id)
      .map((s) => ({
        location_id: s.location_id,
        location_name: s.locations?.name,
        location_type: s.locations?.type,
        quantity: s.quantity,
        reserved_quantity: s.reserved_quantity,
        available_quantity: s.available_quantity,
      })),
  }));

  return NextResponse.json({ results });
}
