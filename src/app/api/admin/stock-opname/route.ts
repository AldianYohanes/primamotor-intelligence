import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";

const opnameSchema = z.object({
  product_id: z.string().uuid(),
  location_id: z.string().uuid(),
  counted_quantity: z.number().int().min(0),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const productId = req.nextUrl.searchParams.get("product_id");
  const { page, pageSize, from, to } = parsePagination(req);

  let query = supabase
    .from("stock_opname")
    .select("*, products(name), locations(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (productId) query = query.eq("product_id", productId);

  const { data, error, count } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    buildPaginatedResponse(data ?? [], count, page, pageSize),
  );
}

/**
 * Catat hasil hitung fisik + otomatis buat transaksi 'adjustment' kalau ada selisih,
 * supaya stock (saldo) & stock_transactions (ledger) tetap konsisten setelahnya
 * (§4.3 desain database — stock_opname adalah CATATAN AUDIT, bukan sumber saldo).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, business_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!staffRow)
    return NextResponse.json(
      { error: "Akun staf tidak ditemukan" },
      { status: 403 },
    );

  const parsed = opnameSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const { data: stockRow } = await supabase
    .from("stock")
    .select("quantity")
    .eq("product_id", body.product_id)
    .eq("location_id", body.location_id)
    .maybeSingle();
  const systemQuantity = stockRow?.quantity ?? 0;
  const discrepancy = body.counted_quantity - systemQuantity;

  const { data: opnameRow, error: opnameError } = await supabase
    .from("stock_opname")
    .insert({
      business_id: staffRow.business_id,
      product_id: body.product_id,
      location_id: body.location_id,
      system_quantity: systemQuantity,
      counted_quantity: body.counted_quantity,
      staff_id: staffRow.id,
      notes: body.notes,
    })
    .select()
    .single();

  if (opnameError)
    return NextResponse.json({ error: opnameError.message }, { status: 422 });

  let transactionId: string | null = null;
  if (discrepancy !== 0) {
    const admin = createAdminClient();
    const { data: txnId, error: rpcError } = await admin.rpc(
      "record_stock_transaction",
      {
        p_business_id: staffRow.business_id,
        p_product_id: body.product_id,
        p_location_id: body.location_id,
        p_type: discrepancy > 0 ? "adjustment_in" : "adjustment_out",
        p_quantity: Math.abs(discrepancy),
        p_staff_id: staffRow.id,
        p_notes: `Hasil stock opname #${opnameRow.id}: sistem ${systemQuantity} vs fisik ${body.counted_quantity} (${discrepancy > 0 ? "+" : ""}${discrepancy})`,
      },
    );
    if (rpcError)
      return NextResponse.json(
        { error: rpcError.message, opname: opnameRow },
        { status: 500 },
      );
    transactionId = txnId;
  }

  return NextResponse.json({
    opname: opnameRow,
    transaction_id: transactionId,
  });
}
