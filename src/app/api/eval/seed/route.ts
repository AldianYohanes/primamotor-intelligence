import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import { logger } from "@/src/lib/logging/logger";
import { isValidPin, toSyntheticEmail } from "@/src/lib/auth/synthetic-email";
import {
  EVAL_ALIASES,
  EVAL_BUSINESS,
  EVAL_BUSINESS_ID,
  EVAL_LOCATIONS,
  EVAL_PRODUCTS,
} from "@/src/lib/eval/seed-data";
import {
  EVAL_CAR_MODELS,
  EVAL_COMPATIBILITY,
  EVAL_EXAMPLE_BUSINESSES,
  EVAL_EXTRA_STAFF,
  EVAL_PRODUCT_ROWS,
  buildSeedActivity,
} from "@/src/lib/eval/seed-activity";

/**
 * Tombol "Reset data eval" di /eval: sama dengan menjalankan ulang supabase/seed_eval.sql.
 * Tenant eval dihapus (produk, stok, percakapan, audit log ikut terhapus lewat cascade)
 * lalu dibuat ulang dari src/lib/eval/seed-data.ts.
 *
 * Hanya jalan bila ENABLE_EVAL_PAGE=true dan staf yang login ada di tenant eval, jadi
 * tenant lain tidak bisa tersentuh. Baris staf (auth user tetap) dibaca dulu lalu
 * dibuat ulang dengan id yang sama, supaya sesi evaluator tetap berlaku.
 *
 * Selain stok dasar, reset mengisi semua modul dengan data simulasi (lihat seed-activity.ts).
 * Akun staf tambahan dibuat dengan PIN dari SEED_STAFF_PIN (.env.local); kalau kosong atau
 * tidak valid dipakai PIN acak yang tidak disimpan di mana pun.
 */
/** Nama tampil staf seed (akun login tetap sama); diterapkan tiap reset supaya layar tidak menampilkan istilah evaluasi. */
const STAFF_DISPLAY_NAMES: Record<string, string> = {
  owner: "Owner Prima Motor",
  evaluator: "Staf Prima Motor",
};

/** Insert bertahap supaya satu request tidak terlalu besar. */
async function insertChunked(
  insert: (rows: never[]) => PromiseLike<{ error: { message: string } | null }>,
  rows: readonly unknown[],
  size = 400,
) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await insert(rows.slice(i, i + size) as never[]);
    if (error) return { error };
  }
  return { error: null };
}

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

    // Akun staf tambahan dibuat sebelum data lama dihapus, jadi kegagalan di sini tidak merusak tenant.
    const pin =
      process.env.SEED_STAFF_PIN && isValidPin(process.env.SEED_STAFF_PIN)
        ? process.env.SEED_STAFF_PIN
        : String(randomInt(10_000_000, 100_000_000));
    const staffRows = staff.map((s) => ({ ...s, full_name: STAFF_DISPLAY_NAMES[s.username] ?? s.full_name }));
    for (const extra of EVAL_EXTRA_STAFF) {
      const known = staffRows.find((s) => s.username === extra.username);
      if (known) {
        known.full_name = extra.full_name;
        continue;
      }
      const email = toSyntheticEmail(EVAL_BUSINESS.slug, extra.username);
      let authUserId: string | undefined;
      const created = await admin.auth.admin.createUser({ email, password: pin, email_confirm: true });
      if (created.data.user) authUserId = created.data.user.id;
      else {
        const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        authUserId = list.data.users.find((u) => u.email === email)?.id;
      }
      if (!authUserId) throw new Error(`akun ${extra.username}: ${created.error?.message ?? "tidak ditemukan"}`);
      staffRows.push({ id: crypto.randomUUID(), auth_user_id: authUserId, username: extra.username, full_name: extra.full_name, role: "staff" });
    }
    const idOf = (username: string) => staffRows.find((s) => s.username === username)!.id;
    const activity = buildSeedActivity(new Date(), {
      owner: idOf("owner"),
      warehouse: idOf("gudang1"),
      cashiers: EVAL_EXTRA_STAFF.filter((s) => s.kind === "cashier").map((s) => idOf(s.username)),
    });

    // Tabel POS tidak punya ON DELETE CASCADE ke business, jadi dihapus berurutan dulu.
    for (const table of ["warranty_claims", "customer_payments", "sale_payments", "sale_items", "sales", "shifts", "customers", "sale_counters"]) {
      await step(`hapus ${table}`, () => admin.from(table).delete().eq("business_id", EVAL_BUSINESS_ID));
    }
    await step("hapus tenant", () => admin.from("businesses").delete().eq("id", EVAL_BUSINESS_ID));
    await step("buat tenant", () => admin.from("businesses").insert(EVAL_BUSINESS));
    await step("buat lokasi", () => admin.from("locations").insert([...EVAL_LOCATIONS]));
    await step("buat staf", () => admin.from("staff").insert(staffRows.map((s) => ({ ...s, business_id: EVAL_BUSINESS_ID }))));
    await step("data kepegawaian", () =>
      admin.from("staff_employment").insert(
        staffRows.map((s) => ({
          staff_id: s.id,
          business_id: EVAL_BUSINESS_ID,
          employment_type: "full_time",
          base_salary: EVAL_EXTRA_STAFF.find((e) => e.username === s.username)?.salary ?? 6_000_000,
          hire_date: "2024-01-15",
          notes: "Data simulasi",
        })),
      ),
    );
    await step("buat pemasok", () => admin.from("suppliers").insert(activity.suppliers));
    await step("buat produk", () => admin.from("products").insert(EVAL_PRODUCT_ROWS));
    await step("buat alias", () => admin.from("product_aliases").insert(EVAL_ALIASES));

    const models = await admin.from("car_models").upsert(EVAL_CAR_MODELS, { onConflict: "brand,name" }).select("id, name");
    if (models.error) throw new Error(`model mobil: ${models.error.message}`);
    const modelId = new Map((models.data ?? []).map((m) => [m.name as string, m.id as string]));
    await step("kompatibilitas model", () =>
      admin.from("product_model_compatibility").upsert(
        EVAL_COMPATIBILITY.map((c) => ({ product_id: c.product_id, car_model_id: modelId.get(c.model_name)! })),
        { onConflict: "product_id,car_model_id" },
      ),
    );

    await step("buat pelanggan", () => admin.from("customers").insert(activity.customers));
    await step("ledger stok", () => insertChunked((r) => admin.from("stock_transactions").insert(r), activity.ledger));
    await step("buat shift", () => admin.from("shifts").insert(activity.shifts as never));
    await step("buat nota", () => insertChunked((r) => admin.from("sales").insert(r), activity.sales));
    await step("barang nota", () => insertChunked((r) => admin.from("sale_items").insert(r), activity.saleItems));
    await step("pembayaran nota", () => insertChunked((r) => admin.from("sale_payments").insert(r), activity.salePayments));
    await step("penghitung nomor nota", () => admin.from("sale_counters").insert(activity.saleCounters));
    await step("cicilan piutang", () => admin.from("customer_payments").insert(activity.customerPayments as never));
    await step("klaim garansi", () => admin.from("warranty_claims").insert(activity.warrantyClaims as never));
    await step("stock opname", () => admin.from("stock_opname").insert(activity.opnames as never));
    await step("impor nota", () => admin.from("receipt_imports").insert(activity.receiptImports as never));
    await step("baris impor nota", () => admin.from("receipt_import_items").insert(activity.receiptItems as never));
    await step("saran pesan ulang", () => admin.from("reorder_suggestions").insert(activity.reorderSuggestions as never));
    await step("notifikasi", () => admin.from("notifications").insert(activity.notifications as never));

    for (const b of EVAL_EXAMPLE_BUSINESSES) {
      await step(`hapus toko contoh ${b.slug}`, () => admin.from("businesses").delete().eq("id", b.id));
    }
    await step("toko contoh", () => admin.from("businesses").insert([...EVAL_EXAMPLE_BUSINESSES]));

    logger.info("Tenant eval direset", { route: "eval/seed", business_id: EVAL_BUSINESS_ID, staff_id: auth.staffRow.id });
    return NextResponse.json({
      ok: true,
      products: EVAL_PRODUCTS.length,
      transactions: activity.ledger.length,
      sales: activity.sales.length,
      extra_staff_pin: process.env.SEED_STAFF_PIN && isValidPin(process.env.SEED_STAFF_PIN) ? "dari SEED_STAFF_PIN" : "acak, tidak disimpan",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Gagal mereset tenant eval", { route: "eval/seed", business_id: EVAL_BUSINESS_ID, error: err });
    return NextResponse.json(
      { error: `Reset gagal di langkah ${message}. Jalankan supabase/seed_eval.sql di SQL editor.` },
      { status: 500 },
    );
  }
}
