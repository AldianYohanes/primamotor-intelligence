import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { logger } from "@/src/lib/logging/logger";

const supplierSchema = z.object({
  name: z.string().min(1),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = parsePagination(req);

  const { data, error, count } = await supabase
    .from("suppliers")
    .select("*", { count: "exact" })
    .order("name")
    .range(from, to);

  if (error) {
    logger.error("Gagal memuat daftar supplier", {
      route: "admin/suppliers",
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    buildPaginatedResponse(data ?? [], count, page, pageSize),
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: staffRow } = await supabase
    .from("staff")
    .select("business_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!staffRow)
    return NextResponse.json(
      { error: "Akun staf tidak ditemukan" },
      { status: 403 },
    );

  const parsed = supplierSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ ...parsed.data, business_id: staffRow.business_id })
    .select()
    .single();

  if (error) {
    logger.error("Gagal membuat supplier baru", {
      route: "admin/suppliers",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ supplier: data });
}
