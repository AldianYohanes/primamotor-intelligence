import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createReorderSuggestionSchema } from "@/src/lib/agents/tool-schemas";
import type { Database } from "@/src/lib/db/types";

/**
 * Berbeda dari tool lain: ini TIDAK dipanggil dari percakapan chat (Router tidak
 * pernah mengarahkan ke sini), hanya dari app/api/cron/monitor. Karena itu proteksinya
 * pakai CRON_SECRET, bukan sesi staf. Insert langsung ke reorder_suggestions — tidak
 * butuh HITL karena ini cuma notifikasi/saran, bukan aksi tulis stok.
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createReorderSuggestionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reorder_suggestions")
    .insert({
      business_id: body.business_id,
      product_id: body.product_id,
      suggested_quantity: body.suggested_quantity,
      reason: body.reason,
      trend_snapshot:
        (body.trend_snapshot as Database["public"]["Tables"]["reorder_suggestions"]["Row"]["trend_snapshot"]) ??
        null,
      suggested_supplier_id: body.suggested_supplier_id ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suggestion: data });
}
