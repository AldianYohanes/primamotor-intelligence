import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/src/lib/notifications/send-push";

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

  const { data: businesses } = await admin
    .from("businesses")
    .select("id")
    .eq("status", "active");
  if (!businesses) return NextResponse.json({ results });

  for (const business of businesses) {
    const { data: products } = await admin
      .from("products")
      .select("id, name, min_threshold, preferred_supplier_id")
      .eq("business_id", business.id)
      .eq("is_active", true);

    let created = 0;

    for (const product of products ?? []) {
      const { data: trend } = await admin.rpc("get_sales_trend", {
        p_product_id: product.id,
        p_months: 3,
      });
      const totalKeluar = (trend ?? []).reduce(
        (sum, t) => sum + t.total_keluar,
        0,
      );
      const avgPerMonth =
        (trend?.length ?? 0) > 0 ? totalKeluar / (trend?.length ?? 1) : 0;

      const { data: stockRows } = await admin
        .from("stock")
        .select("available_quantity")
        .eq("product_id", product.id);
      const totalAvailable = (stockRows ?? []).reduce(
        (sum, s) => sum + s.available_quantity,
        0,
      );

      const belowThreshold =
        product.min_threshold != null && totalAvailable < product.min_threshold;
      const willRunOutSoon =
        avgPerMonth > 0 && totalAvailable / avgPerMonth < 1;

      if (belowThreshold || willRunOutSoon) {
        const { data: existing } = await admin
          .from("reorder_suggestions")
          .select("id")
          .eq("product_id", product.id)
          .eq("status", "pending")
          .maybeSingle();
        if (existing) continue;

        const suggestedQuantity = Math.max(
          Math.ceil(avgPerMonth * 1.5) - totalAvailable,
          1,
        );
        const reason = belowThreshold
          ? `Stok tersedia (${totalAvailable}) di bawah ambang batas minimum (${product.min_threshold})`
          : `Rata-rata keluar ${avgPerMonth.toFixed(1)}/bulan, stok tersisa ${totalAvailable} (diperkirakan habis <1 bulan)`;

        await admin.from("reorder_suggestions").insert({
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

        await admin.from("notifications").insert({
          business_id: business.id,
          staff_id: null,
          type: "reorder_suggestion",
          title: `Saran restock: ${product.name}`,
          body: reason,
          related_id: product.id,
        });

        // Sebelumnya notifikasi cuma tersimpan di tabel `notifications` (pasif, baru
        // kelihatan kalau staf buka dashboard) — sekarang benar-benar dikirim sebagai
        // push ke semua staf tenant ini lewat Web Push API.
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
  }

  return NextResponse.json({ results });
}
