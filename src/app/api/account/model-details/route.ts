import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/src/lib/auth/staff-context";
import { logger } from "@/src/lib/logging/logger";

const schema = z.object({ enabled: z.boolean() });

/** Staf menyalakan/mematikan tampilan statistik model dan detail proses di chat (akun sendiri). */
export async function POST(req: NextRequest) {
  const auth = await requireApi(null, { requireTenant: false });
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Nilai tidak valid" }, { status: 400 });

  const { error } = await auth.supabase.rpc("set_show_model_details", { p_value: parsed.data.enabled });
  if (error) {
    logger.error("Gagal menyimpan saklar detail model", {
      route: "account/model-details",
      staff_id: auth.staff.id,
      error,
    });
    return NextResponse.json({ error: "Gagal menyimpan pengaturan" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
