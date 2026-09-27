import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireStaff = (permission: Permission = "pos.use") => requireStaffRow(permission);

const paymentSchema = z.object({
  amount: z.number().positive(),
  payment_method: z.enum(["cash", "transfer", "qris", "card"]),
  notes: z.string().trim().max(300).optional(),
});

/**
 * Sengaja TIDAK dibatasi admin/owner — kasir harian yang terima pelunasan
 * piutang dari pelanggan langganan (bengkel bayar cicilan dsb) memang harus
 * bisa mencatatnya langsung, beda dari menambah/mengubah credit_limit
 * (POST /customers, itu keputusan finansial admin/owner).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;
  const { id } = await params;

  const parsed = paymentSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();
  if (!customer) {
    return NextResponse.json(
      { error: "Pelanggan tidak ditemukan" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  const { data: result, error: rpcError } = await admin.rpc(
    "record_customer_payment",
    {
      p_business_id: staffRow.business_id,
      p_customer_id: id,
      p_staff_id: staffRow.id,
      p_amount: parsed.data.amount,
      p_payment_method: parsed.data.payment_method,
      p_notes: parsed.data.notes ?? null,
    },
  );

  if (rpcError) {
    logger.error("RPC record_customer_payment gagal", {
      route: "admin/pos/customers/[id]/payments",
      business_id: staffRow.business_id,
      customer_id: id,
      error: rpcError,
    });
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!result?.ok) {
    const message =
      result?.error === "invalid_amount"
        ? "Jumlah pelunasan tidak valid"
        : result?.error === "customer_not_found"
          ? "Pelanggan tidak ditemukan"
          : (result?.error ?? "Gagal mencatat pelunasan");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, new_balance: result.new_balance });
}
