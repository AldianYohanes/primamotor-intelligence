import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

const supplierSchema = z.object({
  name: z.string().min(1),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireStaff = (permission: Permission = "portal.access") => requireStaffRow(permission);

export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const { page, pageSize, from, to } = parsePagination(req);

  const { data, error, count } = await supabase
    .from("suppliers")
    .select("*", { count: "exact" })
    // Filter eksplisit, bukan cuma andalkan RLS (§10/§15.1) — defense-in-depth.
    .eq("business_id", staffRow.business_id)
    .order("name")
    .range(from, to);

  if (error) {
    logger.error("Gagal memuat daftar supplier", {
      route: "admin/suppliers",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    buildPaginatedResponse(data ?? [], count, page, pageSize),
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = supplierSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ ...parsed.data, business_id: staffRow.business_id })
    .select()
    .single();

  if (error) {
    logger.error("Gagal membuat supplier baru", {
      route: "admin/suppliers",
      business_id: staffRow.business_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ supplier: data });
}
