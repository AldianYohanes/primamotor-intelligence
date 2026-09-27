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

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select(
      "id, sale_number, location_id, staff_id, customer_name, customer_phone, subtotal, discount_amount, tax_amount, total_amount, payment_method, amount_paid, change_amount, status, voided_by, voided_at, void_reason, notes, created_at, locations(name), staff(full_name)",
    )
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();

  if (saleError) {
    logger.error("Gagal memuat detail nota POS", {
      route: "admin/pos/sales/[id]",
      business_id: staffRow.business_id,
      sale_id: id,
      error: saleError,
    });
    return NextResponse.json({ error: saleError.message }, { status: 500 });
  }
  if (!sale)
    return NextResponse.json(
      { error: "Nota tidak ditemukan" },
      { status: 404 },
    );

  const { data: items, error: itemsError } = await supabase
    .from("sale_items")
    .select(
      "id, product_id, quantity, unit_price, discount_amount, subtotal, products(name, part_number, unit, warranty_days)",
    )
    .eq("sale_id", id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    logger.error("Gagal memuat item nota POS", {
      route: "admin/pos/sales/[id]",
      business_id: staffRow.business_id,
      sale_id: id,
      error: itemsError,
    });
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: claims, error: claimsError } = itemIds.length
    ? await supabase
        .from("warranty_claims")
        .select("sale_item_id, resolution, created_at")
        .in("sale_item_id", itemIds)
    : { data: [], error: null };
  if (claimsError) {
    logger.error("Gagal memuat klaim garansi nota POS", {
      route: "admin/pos/sales/[id]",
      business_id: staffRow.business_id,
      sale_id: id,
      error: claimsError,
    });
    return NextResponse.json({ error: claimsError.message }, { status: 500 });
  }
  const claimBySaleItem = new Map(
    (claims ?? []).map((c) => [c.sale_item_id, c]),
  );

  const itemsWithWarranty = (items ?? []).map((item) => {
    // @ts-expect-error -- bentuk join Supabase, products adalah objek tunggal (many-to-one)
    const warrantyDays: number | null = item.products?.warranty_days ?? null;
    const warrantyUntil =
      warrantyDays != null
        ? new Date(
            new Date(sale.created_at).getTime() +
              warrantyDays * 24 * 60 * 60 * 1000,
          ).toISOString()
        : null;
    return {
      ...item,
      warranty_until: warrantyUntil,
      warranty_claim: claimBySaleItem.get(item.id) ?? null,
    };
  });

  return NextResponse.json({ sale, items: itemsWithWarranty });
}
