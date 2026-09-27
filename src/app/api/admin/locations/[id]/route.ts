import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logging/logger";
import { requireStaffRow } from "@/src/lib/auth/staff-context";
import type { Permission } from "@/src/lib/auth/rbac";

// Otorisasi terpusat (src/lib/auth/staff-context.ts); business_id = tenant aktif.
const requireStaff = (permission: Permission = "portal.access") => requireStaffRow(permission);

const locationPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.enum(["toko", "gudang"]).optional(),
    address: z.string().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .strict()
  // Koordinat selalu dikirim berpasangan (constraint locations_coordinates_pair).
  .refine((d) => (d.latitude === undefined) === (d.longitude === undefined), {
    message: "Latitude dan longitude harus dikirim berpasangan",
    path: ["longitude"],
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const parsed = locationPatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "Tidak ada field untuk diperbarui" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("locations")
    .update(parsed.data)
    .eq("id", id)
    .eq("business_id", staffRow.business_id)
    .select()
    .single();

  if (error) {
    logger.error("Gagal update lokasi", {
      route: "admin/locations/[id]",
      business_id: staffRow.business_id,
      location_id: id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ location: data });
}

/**
 * DELETE ini HARD delete (locations tidak punya kolom is_active, beda dari
 * products yang soft-delete) — sesuai RLS "locations delete full_access" yang
 * memang mengizinkan DELETE fisik. Tapi stock_transactions.location_id TIDAK
 * ON DELETE CASCADE (lihat 0011_stock_transactions.sql) — begitu lokasi
 * pernah dipakai transaksi apa pun, DB akan menolak DELETE lewat FK constraint
 * (kode 23503). Kita tangkap itu dan kasih pesan yang jelas, BUKAN paksa hapus
 * paksa (mis. via CASCADE) karena itu akan menghapus histori transaksi.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const { error } = await supabase
    .from("locations")
    .delete()
    .eq("id", id)
    .eq("business_id", staffRow.business_id);

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "Lokasi ini tidak bisa dihapus karena sudah punya histori transaksi stok. Ganti namanya jadi non-aktif kalau sudah tidak dipakai.",
        },
        { status: 409 },
      );
    }
    logger.error(
      "Gagal hapus lokasi (bukan constraint 23503 yang sudah diketahui)",
      {
        route: "admin/locations/[id]",
        business_id: staffRow.business_id,
        location_id: id,
        error,
      },
    );
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
