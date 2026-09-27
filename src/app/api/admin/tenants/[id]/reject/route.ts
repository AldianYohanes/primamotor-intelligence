import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/src/lib/auth/staff-context";
import { logger } from "@/src/lib/logging/logger";

const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rawBody = await req.json().catch(() => ({}));
  const parsed = rejectSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  // RPC tetap menegakkan is_super_admin() di DB; cek di sini memberi 401/403
  // yang jelas sebelum menyentuh DB.
  const auth = await requireApi("tenant.approve", { requireTenant: false });
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { error } = await supabase.rpc("reject_business_signup", {
    p_business_id: id,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) {
    logger.error("Gagal reject tenant baru", {
      route: "admin/tenants/[id]/reject",
      business_id: id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
