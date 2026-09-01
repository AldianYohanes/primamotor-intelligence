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

/**
 * Cukup daftar sederhana (tanpa pagination server-side) — jumlah pelanggan
 * langganan yang dikasih piutang biasanya kecil (puluhan, bukan ribuan) untuk
 * toko sekelas ini. Kalau nanti membengkak, pola pagination di sales/route.ts
 * tinggal dicontek.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const q = req.nextUrl.searchParams.get("q")?.trim();

  let query = supabase
    .from("customers")
    .select("id, name, phone, credit_limit, balance, notes, created_at")
    .eq("business_id", staffRow.business_id)
    .order("name", { ascending: true })
    .limit(100);

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    logger.error("Gagal memuat daftar pelanggan POS", {
      route: "admin/pos/customers",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customers: data ?? [] });
}

const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(200),
  phone: z.string().trim().max(50).optional(),
  credit_limit: z.number().min(0).default(0),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Dibatasi admin/owner — credit_limit adalah keputusan finansial (siapa boleh
 * ngutang berapa), bukan sesuatu yang kasir harian putuskan sendiri saat checkout.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  if (staffRow.role !== "owner" && staffRow.role !== "admin") {
    return NextResponse.json(
      { error: "Hanya admin/owner yang bisa menambah pelanggan piutang" },
      { status: 403 },
    );
  }

  const parsed = createCustomerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ ...parsed.data, business_id: staffRow.business_id })
    .select("id, name, phone, credit_limit, balance, notes, created_at")
    .single();

  if (error) {
    logger.error("Gagal membuat pelanggan POS", {
      route: "admin/pos/customers",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data }, { status: 201 });
}
