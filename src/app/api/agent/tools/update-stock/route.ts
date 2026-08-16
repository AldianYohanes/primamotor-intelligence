import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateStockSchema } from "@/src/lib/agents/tool-schemas";

/**
 * Tahap 1 dari pola HITL dua-tahap: catat niat agent ke agent_audit_log (status
 * 'pending'), JANGAN eksekusi dulu. Eksekusi sesungguhnya terjadi di
 * update-stock/confirm setelah staf memasukkan PIN.
 *
 * business_id & conversation_id di body TETAP divalidasi ulang terhadap sesi staf
 * yang login (bukan dipercaya mentah dari client) — konsisten dengan get-stock.
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

  const parsed = updateStockSchema.safeParse(await req.json());
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

  // Validasi product_id & location_id benar-benar milik tenant ini (defense in depth,
  // meski RLS juga akan menolak kalau tidak match)
  const [{ data: product }, { data: location }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name")
      .eq("id", body.product_id)
      .eq("business_id", body.business_id)
      .maybeSingle(),
    supabase
      .from("locations")
      .select("id, name")
      .eq("id", body.location_id)
      .eq("business_id", body.business_id)
      .maybeSingle(),
  ]);
  if (!product)
    return NextResponse.json(
      { error: "Produk tidak ditemukan di tenant ini" },
      { status: 404 },
    );
  if (!location)
    return NextResponse.json(
      { error: "Lokasi tidak ditemukan di tenant ini" },
      { status: 404 },
    );

  const admin = createAdminClient();

  // Bersihkan reservasi 'pending' yang sudah basi dulu (staf lama menutup tab tanpa
  // klik Batal/kirim PIN) — supaya reserve_stock di bawah tidak salah menolak gara-gara
  // stok "dipegang" transaksi yang sebenarnya sudah ditinggalkan. Lihat 0023_stock_reservations.sql.
  await admin.rpc("expire_stale_pending_reservations", {
    p_business_id: body.business_id,
  });

  if (body.direction === "keluar") {
    // reserve_stock (0010_stock.sql) melakukan cek KETERSEDIAAN + reservasi dalam satu
    // pernyataan atomik (aman dari race condition dua proposal bersamaan) — menggantikan
    // SELECT manual yang cuma "melihat" tanpa mengunci apa pun. Reservasi ini WAJIB
    // dilepas persis sekali: lihat update-stock/confirm (sukses/gagal) dan
    // app/api/agent/tools/reject (dibatalkan staf).
    const { error: reserveError } = await admin.rpc("reserve_stock", {
      p_product_id: body.product_id,
      p_location_id: body.location_id,
      p_quantity: body.quantity,
    });
    if (reserveError) {
      return NextResponse.json(
        { error: "Stok tersedia tidak mencukupi untuk transaksi ini" },
        { status: 422 },
      );
    }
  }

  const { data: auditLog, error } = await admin
    .from("agent_audit_log")
    .insert({
      business_id: body.business_id,
      conversation_id: body.conversation_id,
      agent_type: "transaction",
      tool_name: "updateStock",
      input_params: body,
      decision_reason: body.reasoning,
      requires_confirmation: true,
      status: "pending",
    })
    .select()
    .single();

  if (error || !auditLog)
    return NextResponse.json(
      { error: "Gagal mencatat niat transaksi" },
      { status: 500 },
    );

  return NextResponse.json({
    audit_log_id: auditLog.id,
    product_name: product.name,
    location_name: location.name,
    message: `Konfirmasi: ${body.direction} ${body.quantity} unit ${product.name} di ${location.name}? Masukkan PIN untuk melanjutkan.`,
  });
}
