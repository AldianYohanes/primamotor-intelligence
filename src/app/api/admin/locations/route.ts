import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

const locationSchema = z.object({
  name: z.string().min(1, "Nama lokasi wajib diisi"),
  type: z.enum(["toko", "gudang"]),
  address: z.string().optional(),
});

/**
 * Lokasi biasanya sedikit per toko (toko + 1-2 gudang) — tapi tetap pakai
 * parsePagination/buildPaginatedResponse (§4) demi konsistensi pola, bukan
 * reimplement list sederhana manual.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const { page, pageSize, from, to } = parsePagination(req);

  const { data, error, count } = await supabase
    .from("locations")
    .select("*", { count: "exact" })
    .eq("business_id", staffRow.business_id)
    .order("name", { ascending: true })
    .range(from, to);

  if (error) {
    logger.error("Gagal memuat daftar lokasi", {
      route: "admin/locations",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    buildPaginatedResponse(data ?? [], count, page, pageSize),
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = locationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // business_id dari requireStaff(), bukan dari body — sama seperti pola products (§4).
  const { data, error } = await supabase
    .from("locations")
    .insert({ ...parsed.data, business_id: staffRow.business_id })
    .select()
    .single();

  if (error) {
    logger.error("Gagal membuat lokasi baru", {
      route: "admin/locations",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ location: data }, { status: 201 });
}
