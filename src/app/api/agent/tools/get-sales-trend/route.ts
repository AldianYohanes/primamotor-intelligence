import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const querySchema = z.object({
  product_id: z.string().uuid(),
  months: z.coerce.number().int().min(1).max(24).default(6),
})

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: staffRow } = await supabase.from('staff').select('business_id').eq('auth_user_id', user.id).single()
  if (!staffRow) return NextResponse.json({ error: 'Akun staf tidak ditemukan' }, { status: 403 })

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid', details: parsed.error.flatten() }, { status: 400 })
  }

  // Pastikan produk memang milik tenant staf ini sebelum menjalankan RPC
  const { data: product } = await supabase
    .from('products')
    .select('id, name')
    .eq('id', parsed.data.product_id)
    .eq('business_id', staffRow.business_id)
    .maybeSingle()
  if (!product) return NextResponse.json({ error: 'Produk tidak ditemukan di tenant ini' }, { status: 404 })

  const { data, error } = await supabase.rpc('get_sales_trend', {
    p_product_id: parsed.data.product_id,
    p_months: parsed.data.months,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product_name: product.name, trend: data })
}
