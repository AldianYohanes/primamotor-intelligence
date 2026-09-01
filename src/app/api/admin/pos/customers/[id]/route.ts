import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;
  const { id } = await params;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name, phone, credit_limit, balance, notes, created_at")
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();

  if (customerError) {
    logger.error("Gagal memuat detail pelanggan POS", {
      route: "admin/pos/customers/[id]",
      business_id: staffRow.business_id,
      customer_id: id,
      error: customerError,
    });
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }
  if (!customer) return NextResponse.json({ error: "Pelanggan tidak ditemukan" }, { status: 404 });

  const [{ data: recentSales }, { data: payments }] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_number, total_amount, status, created_at")
      .eq("customer_id", id)
      .eq("payment_method", "piutang")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("customer_payments")
      .select("id, amount, payment_method, notes, created_at, staff(full_name)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({ customer, recentSales: recentSales ?? [], payments: payments ?? [] });
}
