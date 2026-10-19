import { NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import { logger } from "@/src/lib/logging/logger";
import {
  EVAL_ALIASES,
  EVAL_BUSINESS,
  EVAL_BUSINESS_ID,
  EVAL_LOCATIONS,
  EVAL_PRODUCTS,
  buildSeedTransactions,
} from "@/src/lib/eval/seed-data";

/**
 * Tombol "Reset data eval" di /eval: sama dengan menjalankan ulang supabase/seed_eval.sql.
 * Tenant eval dihapus (produk, stok, percakapan, audit log ikut terhapus lewat cascade)
 * lalu dibuat ulang dari src/lib/eval/seed-data.ts.
 *
 * Hanya jalan bila ENABLE_EVAL_PAGE=true dan staf yang login ada di tenant eval, jadi
 * tenant lain tidak bisa tersentuh. Baris staf (auth user tetap) dibaca dulu lalu
 * dibuat ulang dengan id yang sama, supaya sesi evaluator tetap berlaku.
 */
export async function POST() {
  if (process.env.ENABLE_EVAL_PAGE !== "true") {
    return NextResponse.json({ error: "Halaman eval tidak aktif" }, { status: 404 });
  }
  const auth = await requireStaffRow("chat.use");
  if ("error" in auth) return auth.error;
  if (auth.staffRow.business_id !== EVAL_BUSINESS_ID) {
    return NextResponse.json({ error: "Reset hanya untuk tenant evaluasi" }, { status: 403 });
  }

  const admin = createAdminClient();
  const step = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run();
    if (error) throw new Error(`${label}: ${error.message}`);
  };

  try {
    const { data: staff, error: staffError } = await admin
      .from("staff")
      .select("id, auth_user_id, username, full_name, role")
      .eq("business_id", EVAL_BUSINESS_ID);
    if (staffError || !staff?.length) throw new Error(`baca staf: ${staffError?.message ?? "tidak ada staf"}`);

    await step("hapus tenant", () => admin.from("businesses").delete().eq("id", EVAL_BUSINESS_ID));
    await step("buat tenant", () => admin.from("businesses").insert(EVAL_BUSINESS));
    await step("buat lokasi", () => admin.from("locations").insert([...EVAL_LOCATIONS]));
    await step("buat staf", () =>
      admin.from("staff").insert(staff.map((s) => ({ ...s, business_id: EVAL_BUSINESS_ID }))),
    );
    await step("buat produk", () => admin.from("products").insert(EVAL_PRODUCTS));
    await step("buat alias", () => admin.from("product_aliases").insert(EVAL_ALIASES));
    const { opening, sales } = buildSeedTransactions(new Date());
    await step("saldo awal", () => admin.from("stock_transactions").insert(opening));
    await step("riwayat penjualan", () => admin.from("stock_transactions").insert(sales));

    logger.info("Tenant eval direset", { route: "eval/seed", business_id: EVAL_BUSINESS_ID, staff_id: auth.staffRow.id });
    return NextResponse.json({ ok: true, products: EVAL_PRODUCTS.length, transactions: opening.length + sales.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Gagal mereset tenant eval", { route: "eval/seed", business_id: EVAL_BUSINESS_ID, error: err });
    return NextResponse.json(
      { error: `Reset gagal di langkah ${message}. Jalankan supabase/seed_eval.sql di SQL editor.` },
      { status: 500 },
    );
  }
}
