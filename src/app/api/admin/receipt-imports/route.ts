import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractReceiptWithGemini } from "@/src/lib/ocr/gemini";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { checkOcrRateLimit } from "@/src/lib/rate-limit/ocr-rate-limit";
import { logger } from "@/src/lib/logging/logger";

/**
 * Alur: upload foto → simpan ke storage bucket 'receipts' → panggil Gemini →
 * fuzzy-match tiap baris hasil OCR ke produk (search_products) → simpan sebagai
 * receipt_import_items berstatus 'matched'/'unmatched' untuk direview staf.
 * TIDAK ada baris yang langsung masuk stock_transactions di tahap ini (§4.4).
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

  // Rate limit DULUAN, sebelum bikin baris receipt_imports atau upload apa pun —
  // OCR Gemini itu satu-satunya endpoint berbayar-per-panggilan di aplikasi ini
  // (§6/§12: WebLLM on-device gratis, ini pengecualian yang perlu dijaga biayanya).
  let rateLimit;
  try {
    rateLimit = await checkOcrRateLimit(supabase, staffRow.business_id);
  } catch (err) {
    logger.error("Gagal cek OCR rate limit", {
      route: "admin/receipt-imports",
      business_id: staffRow.business_id,
      error: err,
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Gagal memeriksa rate limit",
      },
      { status: 500 },
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Batas ${rateLimit.limitCount} upload bon per jam untuk toko ini sudah tercapai. Coba lagi dalam ${Math.ceil(rateLimit.retryAfterSeconds / 60)} menit.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file)
    return NextResponse.json(
      { error: "File bon wajib diunggah" },
      { status: 400 },
    );

  const { data: importRow, error: importError } = await supabase
    .from("receipt_imports")
    .insert({
      business_id: staffRow.business_id,
      source: "ocr_photo",
      ocr_provider: "gemini",
      status: "processing",
      uploaded_by: staffRow.id,
    })
    .select()
    .single();
  if (importError || !importRow) {
    logger.error("Gagal membuat catatan receipt_imports", {
      route: "admin/receipt-imports",
      business_id: staffRow.business_id,
      error: importError,
    });
    return NextResponse.json(
      { error: "Gagal membuat catatan import" },
      { status: 500 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const path = `${staffRow.business_id}/${importRow.id}.jpg`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("receipts")
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) {
    logger.error("Gagal upload foto bon ke storage", {
      route: "admin/receipt-imports",
      business_id: staffRow.business_id,
      import_id: importRow.id,
      error: uploadError,
    });
    await admin
      .from("receipt_imports")
      .update({ status: "failed" })
      .eq("id", importRow.id);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  try {
    const lines = await extractReceiptWithGemini(base64, file.type);

    const itemsToInsert = await Promise.all(
      lines.map(async (line) => {
        const { data: matches } = await supabase.rpc("search_products", {
          p_business_id: staffRow.business_id,
          p_query: line.product_name_guess,
          p_limit: 1,
        });
        const best = matches?.[0];
        const confident = best && best.similarity_score >= 0.4;

        return {
          import_id: importRow.id,
          raw_line_text: line.raw_line_text,
          matched_product_id: confident ? best.product_id : null,
          suggested_quantity: line.quantity,
          suggested_transaction_type: "masuk" as const,
          match_confidence: best?.similarity_score ?? 0,
          status: confident ? ("matched" as const) : ("unmatched" as const),
        };
      }),
    );

    await admin.from("receipt_import_items").insert(itemsToInsert);
    await admin
      .from("receipt_imports")
      .update({
        status: "needs_review",
        raw_ocr_text: JSON.stringify(lines),
        file_url: path,
        processed_at: new Date().toISOString(),
      })
      .eq("id", importRow.id);

    return NextResponse.json({
      import_id: importRow.id,
      items_count: itemsToInsert.length,
    });
  } catch (err) {
    // Gagal di titik ini biasanya berarti Gemini API error/timeout, atau
    // search_products RPC bermasalah — worth dibedakan dari upload gagal di atas
    // karena ini kegagalan di tengah proses OCR (biaya API sudah/belum kepakai
    // tergantung di mana persisnya gagal, itu sendiri worth diketahui).
    logger.error("Proses OCR/ekstraksi bon gagal", {
      route: "admin/receipt-imports",
      business_id: staffRow.business_id,
      import_id: importRow.id,
      error: err,
    });
    await admin
      .from("receipt_imports")
      .update({ status: "failed" })
      .eq("id", importRow.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OCR gagal" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = parsePagination(req);

  const { data, error, count } = await supabase
    .from("receipt_imports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    logger.error("Gagal memuat daftar receipt imports", {
      route: "admin/receipt-imports",
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    buildPaginatedResponse(data ?? [], count, page, pageSize),
  );
}
