import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Tahap akhir §4.4: hanya item berstatus 'confirmed' yang di-commit jadi transaksi
 * 'masuk' nyata via record_stock_transaction. Item 'rejected'/'unmatched' dilewati.
 * Setelah semua diproses, receipt_imports ditandai 'completed'.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: staffRow } = await supabase.from('staff').select('id, business_id').eq('auth_user_id', user.id).single()
  if (!staffRow) return NextResponse.json({ error: 'Akun staf tidak ditemukan' }, { status: 403 })

  const { data: importRow } = await supabase.from('receipt_imports').select('id, business_id').eq('id', id).single()
  if (!importRow) return NextResponse.json({ error: 'Import tidak ditemukan' }, { status: 404 })

  const { data: items } = await supabase
    .from('receipt_import_items')
    .select('*')
    .eq('import_id', id)
    .eq('status', 'confirmed')

  const admin = createAdminClient()
  const committed: string[] = []
  const failed: { item_id: string; error: string }[] = []

  for (const item of items ?? []) {
    if (!item.matched_product_id || !item.suggested_quantity) {
      failed.push({ item_id: item.id, error: 'Produk atau kuantitas belum lengkap' })
      continue
    }

    // Lokasi default = toko pertama tenant ini (barang masuk dari bon biasanya langsung ke toko)
    const { data: defaultLocation } = await admin
      .from('locations')
      .select('id')
      .eq('business_id', importRow.business_id)
      .eq('type', 'toko')
      .limit(1)
      .maybeSingle()

    if (!defaultLocation) {
      failed.push({ item_id: item.id, error: 'Lokasi toko default tidak ditemukan' })
      continue
    }

    const { data: txnId, error: rpcError } = await admin.rpc('record_stock_transaction', {
      p_business_id: importRow.business_id,
      p_product_id: item.matched_product_id,
      p_location_id: defaultLocation.id,
      p_type: 'masuk',
      p_quantity: item.suggested_quantity,
      p_staff_id: staffRow.id,
      p_idempotency_key: `receipt-item:${item.id}`,
      p_notes: `Dari review bon (import ${id}): "${item.raw_line_text}"`,
    })

    if (rpcError) {
      failed.push({ item_id: item.id, error: rpcError.message })
      continue
    }

    await admin.from('receipt_import_items').update({ resulting_transaction_id: txnId }).eq('id', item.id)
    committed.push(item.id)
  }

  await admin.from('receipt_imports').update({ status: 'completed' }).eq('id', id)

  return NextResponse.json({ committed_count: committed.length, failed })
}
