import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  const { data: staffRow } = await supabase.from('staff').select('id, business_id, role').eq('auth_user_id', user.id).single()
  if (!staffRow) return { error: NextResponse.json({ error: 'Akun staf tidak ditemukan' }, { status: 403 }) } as const
  return { supabase, staffRow } as const
}

const locationPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.enum(['toko', 'gudang']).optional(),
    address: z.string().optional(),
  })
  .strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireStaff()
  if ('error' in ctx) return ctx.error
  const { supabase, staffRow } = ctx

  const parsed = locationPatchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid', details: parsed.error.flatten() }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada field untuk diperbarui' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('locations')
    .update(parsed.data)
    .eq('id', id)
    .eq('business_id', staffRow.business_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  return NextResponse.json({ location: data })
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
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireStaff()
  if ('error' in ctx) return ctx.error
  const { supabase, staffRow } = ctx

  const { error } = await supabase.from('locations').delete().eq('id', id).eq('business_id', staffRow.business_id)

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'Lokasi ini tidak bisa dihapus karena sudah punya histori transaksi stok. Ganti namanya jadi non-aktif kalau sudah tidak dipakai.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 422 })
  }
  return NextResponse.json({ ok: true })
}
