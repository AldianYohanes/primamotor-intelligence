import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/src/lib/notifications/send-push";
import { logger } from "@/src/lib/logging/logger";

export const maxDuration = 300; // Vercel Cron: analisis semua tenant bisa memakan waktu

/**
 * Monitoring Agent — TIDAK reaktif, dijalankan Vercel Cron (lihat vercel.json),
 * bukan dipicu percakapan. Logikanya heuristik sederhana di sini (bukan lewat
 * WebLLM, karena tidak ada percakapan/browser yang aktif saat cron jalan):
 * bandingkan rata-rata keluar/bulan (3 bulan terakhir) terhadap available_quantity
 * dan min_threshold. Prompt di lib/agents/prompts/monitoring-agent.ts tetap jadi
 * acuan aturan bisnisnya supaya konsisten kalau nanti mau diarahkan ke LLM juga.
 */
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: { business_id: string; suggestions_created: number }[] = [];
  const runStartedAt = performance.now();

  const { data: businesses, error: businessesError } = await admin
    .from("businesses")
    .select("id")
    .eq("status", "active");
  if (businessesError) {
    // Kalau query paling awal ini gagal, tidak ada satu tenant pun yang
    // sempat diproses — ini beda dari "0 tenant butuh restock", jadi wajib
    // dibedakan lewat status 500 + log, bukan diam-diam balas results kosong
    // seolah cron sukses jalan normal.
    logger.error("Gagal memuat daftar business aktif untuk monitoring cron", {
      route: "cron/monitor",
      error: businessesError,
    });
    return NextResponse.json(
      { error: "Gagal memuat daftar business" },
      { status: 500 },
    );
  }
  if (!businesses) return NextResponse.json({ results });

  let businessesWithErrors = 0;

  for (const business of businesses) {
    // Satu tenant gagal (mis. RPC timeout, data korup) TIDAK BOLEH menghentikan
    // proses tenant lain — cron ini jalan lintas semua toko sekaligus, jadi
    // isolasi kegagalan per-tenant penting. Sebelumnya semua error di loop ini
    // (RPC, query stock, insert suggestion/notification) diam-diam diabaikan;
    // sekarang minimal tercatat, dan satu tenant yang error tidak menghambat
    // hasil tenant lainnya.
    try {
      const { data: products, error: productsError } = await admin
        .from("products")
        .select("id, name, min_threshold, preferred_supplier_id")
        .eq("business_id", business.id)
        .eq("is_active", true);
      if (productsError) {
        logger.error("Gagal memuat produk aktif untuk monitoring", {
          route: "cron/monitor",
          business_id: business.id,
          error: productsError,
        });
        businessesWithErrors += 1;
        results.push({ business_id: business.id, suggestions_created: 0 });
        continue;
      }

      let created = 0;

      for (const product of products ?? []) {
        const { data: trend, error: trendError } = await admin.rpc(
          "get_sales_trend",
          { p_product_id: product.id, p_months: 3 },
        );
        if (trendError) {
          logger.error("Gagal ambil tren penjualan produk saat monitoring", {
            route: "cron/monitor",
            business_id: business.id,
            product_id: product.id,
            error: trendError,
          });
          continue; // lanjut ke produk lain, jangan gagalkan seluruh tenant
        }
        const totalKeluar = (trend ?? []).reduce(
          (sum, t) => sum + t.total_keluar,
          0,
        );
        const avgPerMonth =
          (trend?.length ?? 0) > 0 ? totalKeluar / (trend?.length ?? 1) : 0;

        const { data: stockRows, error: stockError } = await admin
          .from("stock")
          .select("available_quantity")
          .eq("product_id", product.id);
        if (stockError) {
          logger.error("Gagal ambil stok produk saat monitoring", {
            route: "cron/monitor",
            business_id: business.id,
            product_id: product.id,
            error: stockError,
          });
          continue;
        }
        const totalAvailable = (stockRows ?? []).reduce(
          (sum, s) => sum + s.available_quantity,
          0,
        );

        const belowThreshold =
          product.min_threshold != null &&
          totalAvailable < product.min_threshold;
        const willRunOutSoon =
          avgPerMonth > 0 && totalAvailable / avgPerMonth < 1;

        if (belowThreshold || willRunOutSoon) {
          const { data: existing, error: existingError } = await admin
            .from("reorder_suggestions")
            .select("id")
            .eq("product_id", product.id)
            .eq("status", "pending")
            .maybeSingle();
          if (existingError) {
            logger.error("Gagal cek reorder suggestion existing", {
              route: "cron/monitor",
              business_id: business.id,
              product_id: product.id,
              error: existingError,
            });
            continue;
          }
          if (existing) continue;

          const suggestedQuantity = Math.max(
            Math.ceil(avgPerMonth * 1.5) - totalAvailable,
            1,
          );
          const reason = belowThreshold
            ? `Stok tersedia (${totalAvailable}) di bawah ambang batas minimum (${product.min_threshold})`
            : `Rata-rata keluar ${avgPerMonth.toFixed(1)}/bulan, stok tersisa ${totalAvailable} (diperkirakan habis <1 bulan)`;

          const { error: suggestionError } = await admin
            .from("reorder_suggestions")
            .insert({
              business_id: business.id,
              product_id: product.id,
              suggested_quantity: suggestedQuantity,
              reason,
              trend_snapshot: {
                trend,
                avg_per_month: avgPerMonth,
                total_available: totalAvailable,
              },
              suggested_supplier_id: product.preferred_supplier_id,
              status: "pending",
            });
          if (suggestionError) {
            // Gagal di sini paling krusial dari semua langkah cron ini — kalau
            // insert reorder_suggestions gagal, toko kehilangan saran restock
            // sepenuhnya untuk produk ini di siklus hari ini, bukan cuma
            // notifikasi yang telat. Wajib ke-log, bukan dilanjut diam-diam
            // seolah suggestion-nya berhasil dibuat.
            logger.error("Gagal membuat reorder suggestion", {
              route: "cron/monitor",
              business_id: business.id,
              product_id: product.id,
              error: suggestionError,
            });
            continue;
          }

          const { error: notificationError } = await admin
            .from("notifications")
            .insert({
              business_id: business.id,
              staff_id: null,
              type: "reorder_suggestion",
              title: `Saran restock: ${product.name}`,
              body: reason,
              related_id: product.id,
            });
          if (notificationError) {
            // reorder_suggestion-nya tetap berhasil dibuat di atas — ini cuma
            // notifikasi pasifnya yang gagal, jadi TIDAK `continue` (jangan
            // batalkan push di bawah cuma gara-gara baris notifications gagal),
            // cukup dicatat.
            logger.error("Gagal menyimpan notification reorder suggestion", {
              route: "cron/monitor",
              business_id: business.id,
              product_id: product.id,
              error: notificationError,
            });
          }

          // Sebelumnya notifikasi cuma tersimpan di tabel `notifications` (pasif, baru
          // kelihatan kalau staf buka dashboard) — sekarang benar-benar dikirim sebagai
          // push ke semua staf tenant ini lewat Web Push API. sendPushNotification
          // sengaja tidak di-await dalam try/catch terpisah di sini — kalau dia
          // melempar, biar tertangkap catch per-business di bawah dan tetap kehitung
          // sebagai error tenant ini (bukan bikin seluruh cron run mati).
          await sendPushNotification({
            businessId: business.id,
            staffId: null,
            title: `Saran restock: ${product.name}`,
            body: reason,
          });

          created += 1;
        }
      }

      results.push({ business_id: business.id, suggestions_created: created });
    } catch (err) {
      businessesWithErrors += 1;
      logger.error("Monitoring cron gagal total untuk satu business", {
        route: "cron/monitor",
        business_id: business.id,
        error: err,
      });
      results.push({ business_id: business.id, suggestions_created: 0 });
    }
  }

  logger.info("Monitoring cron run selesai", {
    route: "cron/monitor",
    total_businesses: businesses.length,
    businesses_with_errors: businessesWithErrors,
    total_suggestions_created: results.reduce(
      (sum, r) => sum + r.suggestions_created,
      0,
    ),
    duration_ms: Math.round(performance.now() - runStartedAt),
  });

  return NextResponse.json({ results });
}
