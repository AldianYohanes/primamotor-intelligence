import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transferStockSchema } from "@/src/lib/agents/tool-schemas";

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

  const parsed = transferStockSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  if (body.business_id !== staffRow.business_id) {
    return NextResponse.json(
      { error: "business_id tidak sesuai sesi staf yang login" },
      { status: 403 },
    );
  }

  const [{ data: product }, { data: fromLoc }, { data: toLoc }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .eq("id", body.product_id)
        .eq("business_id", body.business_id)
        .maybeSingle(),
      supabase
        .from("locations")
        .select("id, name")
        .eq("id", body.from_location_id)
        .eq("business_id", body.business_id)
        .maybeSingle(),
      supabase
        .from("locations")
        .select("id, name")
        .eq("id", body.to_location_id)
        .eq("business_id", body.business_id)
        .maybeSingle(),
    ]);
  if (!product)
    return NextResponse.json(
      { error: "Produk tidak ditemukan di tenant ini" },
      { status: 404 },
    );
  if (!fromLoc || !toLoc)
    return NextResponse.json(
      { error: "Lokasi tidak ditemukan di tenant ini" },
      { status: 404 },
    );

  const admin = createAdminClient();

  // Sama seperti update-stock/route.ts: bersihkan reservasi basi dulu, lalu reserve_stock
  // di lokasi ASAL (from_location_id) — lokasi tujuan tidak perlu direservasi, cuma
  // menerima. Menggantikan SELECT manual "melihat" yang lama.
  await admin.rpc("expire_stale_pending_reservations", {
    p_business_id: body.business_id,
  });

  const { error: reserveError } = await admin.rpc("reserve_stock", {
    p_product_id: body.product_id,
    p_location_id: body.from_location_id,
    p_quantity: body.quantity,
  });
  if (reserveError) {
    return NextResponse.json(
      {
        error: `Stok tersedia di ${fromLoc.name} tidak mencukupi untuk transfer ini`,
      },
      { status: 422 },
    );
  }

  const { data: auditLog, error } = await admin
    .from("agent_audit_log")
    .insert({
      business_id: body.business_id,
      conversation_id: body.conversation_id,
      agent_type: "transaction",
      tool_name: "transferStock",
      input_params: body,
      decision_reason: body.reasoning,
      requires_confirmation: true,
      status: "pending",
    })
    .select()
    .single();

  if (error || !auditLog)
    return NextResponse.json(
      { error: "Gagal mencatat niat transfer" },
      { status: 500 },
    );

  return NextResponse.json({
    audit_log_id: auditLog.id,
    message: `Konfirmasi: pindahkan ${body.quantity} unit ${product.name} dari ${fromLoc.name} ke ${toLoc.name}? Masukkan PIN untuk melanjutkan.`,
  });
}
