import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireStaff = (permission: Permission = "pos.use") => requireStaffRow(permission);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  if (!customer)
    return NextResponse.json(
      { error: "Pelanggan tidak ditemukan" },
      { status: 404 },
    );

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

  return NextResponse.json({
    customer,
    recentSales: recentSales ?? [],
    payments: payments ?? [],
  });
}
