import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";

const itemUpdateSchema = z.object({
  matched_product_id: z.string().uuid().nullable().optional(),
  suggested_quantity: z.number().int().positive().optional(),
  status: z.enum(["unmatched", "matched", "confirmed", "rejected"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const auth = await requireStaffRow("portal.access");
  if ("error" in auth) return auth.error;
  const { supabase, staffRow } = auth;

  const parsed = itemUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // receipt_import_items tidak punya kolom business_id sendiri — pastikan
  // dulu item ini memang milik receipt_import tenant staf ini sebelum update
  // (pola sama seperti agent/tools/get-sales-trend: verifikasi kepemilikan
  // resource dulu, baru mutasi), bukan cuma andalkan RLS (§10/§15.1).
  const { data: item } = await supabase
    .from("receipt_import_items")
    .select("id, import_id, receipt_imports!inner(business_id)")
    .eq("id", itemId)
    .eq("import_id", id)
    .eq("receipt_imports.business_id", staffRow.business_id)
    .maybeSingle();
  if (!item)
    return NextResponse.json(
      { error: "Item receipt import tidak ditemukan di tenant ini" },
      { status: 404 },
    );

  const { data, error } = await supabase
    .from("receipt_import_items")
    .update({ ...parsed.data, reviewed_by: staffRow.id })
    .eq("id", itemId)
    .select()
    .single();

  if (error) {
    logger.error("Gagal update receipt import item", {
      route: "admin/receipt-imports/[id]/items/[itemId]",
      item_id: itemId,
      reviewed_by_staff_id: staffRow.id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ item: data });
}
