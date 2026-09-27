import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireStaff = (permission: Permission = "portal.access") => requireStaffRow(permission);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  // Scope eksplisit ke tenant pemanggil (§10/§15.1) — jangan cuma andalkan RLS.
  const { data: importRow, error: importError } = await supabase
    .from("receipt_imports")
    .select("*")
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .single();

  if (importError || !importRow)
    return NextResponse.json(
      { error: "Import tidak ditemukan" },
      { status: 404 },
    );

  // receipt_import_items sendiri tidak punya kolom business_id — tenant
  // sudah diverifikasi lewat importRow di atas, jadi query by import_id di
  // sini aman (item selalu satu tenant yang sama dengan parent import-nya).
  const { data: items, error: itemsError } = await supabase
    .from("receipt_import_items")
    .select("*, products(name, part_number)")
    .eq("import_id", id)
    .order("created_at");

  if (itemsError) {
    logger.error("Gagal memuat item receipt import", {
      route: "admin/receipt-imports/[id]",
      import_id: id,
      error: itemsError,
    });
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ import: importRow, items });
}
