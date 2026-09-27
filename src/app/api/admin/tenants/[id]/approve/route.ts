import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/src/lib/auth/staff-context";
import { logger } from "@/src/lib/logging/logger";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // RPC tetap menegakkan is_super_admin() di DB; cek di sini memberi 401/403
  // yang jelas sebelum menyentuh DB.
  const auth = await requireApi("tenant.approve", { requireTenant: false });
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  // RPC approve_business_signup() sendiri yang menegakkan is_super_admin() di sisi DB
  // (§0021_signup.sql) — bukan sekadar dicek di kode aplikasi.
  const { error } = await supabase.rpc("approve_business_signup", {
    p_business_id: id,
  });

  if (error) {
    logger.error("Gagal approve tenant baru", {
      route: "admin/tenants/[id]/approve",
      business_id: id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
