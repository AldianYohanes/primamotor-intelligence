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

// Hanya 3 transisi manual yang boleh staf lakukan dari sini — 'pending' cuma
// ditulis Monitoring Agent (cron), tidak pernah lewat endpoint ini.
const patchSchema = z.object({
  status: z.enum(['acknowledged', 'ordered', 'dismissed']),
})

/**
 * PATCH: acknowledge/tandai-sudah-order/dismiss saran restock. `acknowledged_by`
 * & policy "reorder_suggestions update full_access" sudah ada sejak migrasi
 * 0016/0019 tapi belum pernah dipakai endpoint manapun — celah ini yang ditutup
 * di sini, bukan skema baru.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireStaff()
  if ('error' in ctx) return ctx.error
  const { supabase, staffRow } = ctx

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('reorder_suggestions')
    .update({ status: parsed.data.status, acknowledged_by: staffRow.id })
    .eq('id', id)
    .eq('business_id', staffRow.business_id)
    .select()
    .single()

  // RLS "update full_access" akan menolak staf role biasa (bukan admin/owner) —
  // error PostgREST untuk row yang gagal match RLS biasanya muncul sebagai 0 baris
  // ter-update (PGRST116 dari .single() saat data null), bukan exception keras.
  if (error) return NextResponse.json({ error: 'Gagal memperbarui saran (mungkin butuh akses admin/owner)' }, { status: 403 })
  return NextResponse.json({ suggestion: data })
}
