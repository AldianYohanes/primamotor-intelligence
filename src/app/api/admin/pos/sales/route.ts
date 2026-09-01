import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
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

// Whitelist kolom sortable — backend adalah penjaga sesungguhnya (§4). Kalau
// menambah kolom sortable baru di data/coldef.tsx modul pos-sales, update juga di sini.
const SORTABLE_COLUMNS = ["created_at", "total_amount"] as const;
type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const { page, pageSize, from, to } = parsePagination(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status"); // 'completed' | 'voided' | null (semua)
  const paymentMethod = sp.get("payment_method");
  const dateFrom = sp.get("date_from");
  const dateTo = sp.get("date_to");
  const sortByRaw = sp.get("sortBy");
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
  const sortBy: SortableColumn = SORTABLE_COLUMNS.includes(sortByRaw as SortableColumn)
    ? (sortByRaw as SortableColumn)
    : "created_at";

  let query = supabase
    .from("sales")
    .select(
      "id, sale_number, location_id, staff_id, customer_name, subtotal, discount_amount, tax_amount, total_amount, payment_method, amount_paid, change_amount, status, created_at, locations(name), staff(full_name)",
      { count: "exact" },
    )
    .order(sortBy, { ascending: sortDir === "asc" })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (paymentMethod) query = query.eq("payment_method", paymentMethod);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);

  const { data, error, count } = await query;
  if (error) {
    logger.error("Gagal memuat riwayat penjualan POS", {
      route: "admin/pos/sales",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(buildPaginatedResponse(data ?? [], count, page, pageSize));
}

const cartItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  discount_amount: z.number().min(0).optional(),
  // TIDAK ADA unit_price di sini secara sengaja — lihat komentar keamanan di
  // migration 0026_pos_security_hardening.sql. Harga SELALU diambil server
  // dari products.selling_price di dalam RPC record_sale, tidak pernah dari
  // client, supaya tidak ada celah manipulasi harga lewat body request.
});

const paymentLineSchema = z.object({
  method: z.enum(["cash", "transfer", "qris", "card"]),
  amount: z.number().positive(),
});

/**
 * `payments` (jamak) menggantikan `payment_method`+`amount_paid` tunggal dari
 * v1 — mendukung split payment (migration 0027). `payment_method` di body
 * TETAP dikirim client sebagai ringkasan ('cash'/'transfer'/dst kalau satu
 * metode, 'split' kalau >1, 'piutang' kalau piutang) supaya sales.payment_method
 * konsisten dengan isi sale_payments/customer_id — divalidasi silang di bawah,
 * bukan cuma dipercaya mentah dari client.
 */
const checkoutSchema = z
  .object({
    location_id: z.string().uuid(),
    items: z.array(cartItemSchema).min(1, "Keranjang tidak boleh kosong"),
    payment_method: z.enum(["cash", "transfer", "qris", "card", "split", "piutang"]),
    payments: z.array(paymentLineSchema).optional(),
    customer_id: z.string().uuid().optional(),
    discount_amount: z.number().min(0).optional(),
    tax_amount: z.number().min(0).optional(),
    customer_name: z.string().trim().max(200).optional(),
    customer_phone: z.string().trim().max(50).optional(),
    notes: z.string().trim().max(500).optional(),
    // Dibuat client-side (crypto.randomUUID()) sekali per sesi checkout — lihat
    // migration 0025 & komentar di record_sale untuk alasan idempotency di sini.
    idempotency_key: z.string().uuid().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.payment_method === "piutang") {
      if (!body.customer_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pelanggan wajib dipilih untuk piutang", path: ["customer_id"] });
      }
    } else {
      if (!body.payments || body.payments.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Metode pembayaran wajib diisi", path: ["payments"] });
      }
      const isSplit = (body.payments?.length ?? 0) > 1;
      if (isSplit && body.payment_method !== "split") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "payment_method harus 'split' kalau ada >1 baris pembayaran", path: ["payment_method"] });
      }
      if (!isSplit && body.payments?.length === 1 && body.payment_method !== body.payments[0].method) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "payment_method tidak sesuai dengan metode pembayaran yang dikirim", path: ["payment_method"] });
      }
    }
  });

/**
 * Checkout POS. Sengaja TIDAK dibatasi role admin/owner — kasir (role 'staff')
 * memang harus bisa memproses penjualan harian; itu beda dari void (lihat
 * sales/[id]/void/route.ts) yang memang dibatasi manajer + PIN karena
 * membalikkan uang & stok.
 *
 * Validasi product_id & location_id milik tenant ini dilakukan di sini
 * (defense in depth) SEBELUM RPC dipanggil, supaya error "produk tidak
 * ditemukan" jelas dan bukan tersembunyi di balik pesan RPC generik.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = checkoutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Validasi kepemilikan tenant untuk customer_id berlaku UNTUK SEMUA metode
  // pembayaran, bukan cuma piutang — celah yang ditemukan saat audit: kalau
  // hanya divalidasi di cabang 'piutang', customer_id yang ikut terkirim di
  // metode lain (cash/transfer/dst) lolos tanpa dicek sama sekali.
  if (body.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", body.customer_id)
      .eq("business_id", staffRow.business_id)
      .maybeSingle();
    if (!customer) {
      return NextResponse.json({ error: "Pelanggan tidak ditemukan di tenant ini" }, { status: 404 });
    }
  }

  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("id", body.location_id)
    .eq("business_id", staffRow.business_id)
    .maybeSingle();
  if (!location) {
    return NextResponse.json({ error: "Lokasi tidak ditemukan di tenant ini" }, { status: 404 });
  }

  const productIds = [...new Set(body.items.map((i) => i.product_id))];
  const { data: products } = await supabase
    .from("products")
    .select("id")
    .eq("business_id", staffRow.business_id)
    .in("id", productIds);
  const foundIds = new Set((products ?? []).map((p) => p.id));
  const missing = productIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Beberapa produk di keranjang tidak ditemukan di tenant ini", product_ids: missing },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  const { data: result, error: rpcError } = await admin.rpc("record_sale", {
    p_business_id: staffRow.business_id,
    p_location_id: body.location_id,
    p_staff_id: staffRow.id,
    p_items: body.items,
    p_payment_method: body.payment_method,
    p_payments: body.payment_method === "piutang" ? null : body.payments,
    p_customer_id: body.customer_id ?? null,
    p_discount_amount: body.discount_amount ?? 0,
    p_tax_amount: body.tax_amount ?? 0,
    p_customer_name: body.customer_name ?? null,
    p_customer_phone: body.customer_phone ?? null,
    p_notes: body.notes ?? null,
    p_idempotency_key: body.idempotency_key ?? null,
  });

  if (rpcError) {
    // RPC atomik gagal di luar kondisi bisnis yang diharapkan (bukan stok
    // kurang/pembayaran kurang, itu ok:false di bawah) — ini kandidat kuat
    // bug/masalah infra, wajib di-log detail.
    logger.error("RPC record_sale gagal", {
      route: "admin/pos/sales",
      business_id: staffRow.business_id,
      staff_id: staffRow.id,
      location_id: body.location_id,
      error: rpcError,
    });
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!result?.ok) {
    const message =
      result?.error === "empty_cart"
        ? "Keranjang tidak boleh kosong"
        : result?.error === "invalid_quantity"
          ? "Ada item dengan jumlah tidak valid di keranjang"
          : result?.error === "product_not_found_or_inactive"
            ? "Salah satu produk di keranjang tidak aktif/tidak ditemukan — refresh pencarian produk"
            : result?.error === "insufficient_stock"
              ? "Stok tidak mencukupi untuk salah satu produk di keranjang"
              : result?.error === "no_payment"
                ? "Metode pembayaran wajib diisi"
                : result?.error === "insufficient_payment"
                  ? `Jumlah bayar kurang dari total (${result.total_amount ?? "-"})`
                  : result?.error === "overpayment_not_allowed_for_split"
                    ? "Pembayaran gabungan (split) tidak boleh melebihi total — tidak ada kembalian untuk split payment"
                    : result?.error === "overpayment_not_allowed_for_non_cash"
                      ? "Jumlah bayar melebihi total — kembalian cuma berlaku untuk pembayaran tunai"
                      : result?.error === "customer_required"
                      ? "Pelanggan wajib dipilih untuk pembayaran piutang"
                      : result?.error === "customer_not_found"
                        ? "Pelanggan tidak ditemukan"
                        : result?.error === "credit_limit_exceeded"
                          ? `Melebihi limit piutang pelanggan ini (sisa limit: ${result.available_credit ?? 0})`
                          : (result?.error ?? "Gagal memproses penjualan");
    const status =
      result?.error === "insufficient_stock" ||
      result?.error === "insufficient_payment" ||
      result?.error === "credit_limit_exceeded"
        ? 422
        : 400;
    return NextResponse.json({ error: message, product_id: result?.product_id }, { status });
  }

  return NextResponse.json({
    sale_id: result.sale_id,
    sale_number: result.sale_number,
    subtotal: result.subtotal,
    total_amount: result.total_amount,
    change_amount: result.change_amount,
    idempotent_replay: result.idempotent_replay ?? false,
  });
}
