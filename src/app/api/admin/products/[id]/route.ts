import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Sama seperti productSchema di ../route.ts, tapi semua field opsional (PATCH
// parsial) — sengaja tidak diimpor dari route.ts (route segment tidak boleh
// saling impor schema secara langsung di Next.js App Router), didefinisikan
// ulang di sini secara sadar, bukan lupa DRY.
const productPatchSchema = z
  .object({
    part_number: z.string().optional(),
    name: z.string().min(1).optional(),
    category: z.string().optional(),
    unit: z.string().optional(),
    description: z.string().optional(),
    min_threshold: z.number().int().min(0).optional(),
    unit_cost: z.number().min(0).optional(),
    selling_price: z.number().min(0).optional(),
    preferred_supplier_id: z.string().uuid().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strict()

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireStaff()
  if ('error' in ctx) return ctx.error
  const { supabase, staffRow } = ctx

  const parsed = productPatchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid', details: parsed.error.flatten() }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada field untuk diperbarui' }, { status: 400 })
  }

  // business_id di-scope eksplisit di query (bukan cuma andalkan RLS) — konsisten
  // dengan §4/§10: RLS tetap jadi lapisan terakhir, tapi requireStaff() + filter
  // eksplisit ini yang mencegah row tenant lain kena-touch sama sekali.
  const { data, error } = await supabase
    .from('products')
    .update(parsed.data)
    .eq('id', id)
    .eq('business_id', staffRow.business_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  return NextResponse.json({ product: data })
}

// Soft-delete: is_active = false, BUKAN DELETE fisik — supaya histori stock_transactions
// yang mereferensikan produk ini tetap utuh (§13 poin 1 desain database).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireStaff()
  if ('error' in ctx) return ctx.error
  const { supabase, staffRow } = ctx

  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', id)
    .eq('business_id', staffRow.business_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  return NextResponse.json({ ok: true })
}
