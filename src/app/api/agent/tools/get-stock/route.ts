import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const querySchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(5),
})

/**
 * Read-only, tidak butuh HITL. Dipanggil Query Agent & Transaction Agent (untuk
 * konfirmasi product_id sebelum updateStock/transferStock).
 *
 * Pakai server client dengan sesi staf yang login — RLS otomatis membatasi ke
 * tenant staf tersebut lewat auth_business_id(), tidak mengandalkan business_id
 * dari query string sama sekali (mencegah staf toko A mengintip stok toko B).
 */
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

  const { data: matches, error: searchError } = await supabase.rpc('search_products', {
    p_business_id: staffRow.business_id,
    p_query: parsed.data.query,
    p_limit: parsed.data.limit,
  })

  if (searchError) return NextResponse.json({ error: searchError.message }, { status: 500 })
  if (!matches || matches.length === 0) return NextResponse.json({ results: [] })

  const productIds = matches.map((m) => m.product_id)
  const { data: stockRows, error: stockError } = await supabase
    .from('stock')
    .select('product_id, location_id, quantity, reserved_quantity, available_quantity, locations(name, type)')
    .in('product_id', productIds)

  if (stockError) return NextResponse.json({ error: stockError.message }, { status: 500 })

  const results = matches.map((product) => ({
    ...product,
    stock_by_location: (stockRows ?? [])
      .filter((s) => s.product_id === product.product_id)
      .map((s) => ({
        location_id: s.location_id,
        // @ts-expect-error -- bentuk join Supabase, aman secara runtime
        location_name: s.locations?.name,
        // @ts-expect-error
        location_type: s.locations?.type,
        quantity: s.quantity,
        reserved_quantity: s.reserved_quantity,
        available_quantity: s.available_quantity,
      })),
  }))

  return NextResponse.json({ results })
}
