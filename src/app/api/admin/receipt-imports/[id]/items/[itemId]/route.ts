import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const itemUpdateSchema = z.object({
  matched_product_id: z.string().uuid().nullable().optional(),
  suggested_quantity: z.number().int().positive().optional(),
  status: z.enum(['unmatched', 'matched', 'confirmed', 'rejected']).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: staffRow } = await supabase.from('staff').select('id').eq('auth_user_id', user.id).single()
  if (!staffRow) return NextResponse.json({ error: 'Akun staf tidak ditemukan' }, { status: 403 })

  const parsed = itemUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('receipt_import_items')
    .update({ ...parsed.data, reviewed_by: staffRow.id })
    .eq('id', itemId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  return NextResponse.json({ item: data })
}
