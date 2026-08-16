import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/src/lib/logging/logger'

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
    const { data: defaultLocation, error: locationError } = await admin
      .from('locations')
      .select('id')
      .eq('business_id', importRow.business_id)
      .eq('type', 'toko')
      .limit(1)
      .maybeSingle()

    if (locationError) {
      logger.error('Gagal query lokasi default saat commit receipt import', {
        route: 'admin/receipt-imports/commit',
        business_id: importRow.business_id,
        import_id: id,
        item_id: item.id,
        error: locationError,
      })
      failed.push({ item_id: item.id, error: 'Gagal mencari lokasi toko default' })
      continue
    }
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
      // Ini titik paling kritis di alur commit — kalau record_stock_transaction
      // gagal, item bon ini TIDAK jadi stok masuk sama sekali, meski staf sudah
      // review & confirm manual sebelumnya. Wajib ke-log detail (bukan cuma
      // masuk array `failed` yang cuma kelihatan kalau staf buka lagi hasil
      // commit-nya).
      logger.error('RPC record_stock_transaction gagal saat commit receipt import', {
        route: 'admin/receipt-imports/commit',
        business_id: importRow.business_id,
        staff_id: staffRow.id,
        import_id: id,
        item_id: item.id,
        product_id: item.matched_product_id,
        error: rpcError,
      })
      failed.push({ item_id: item.id, error: rpcError.message })
      continue
    }

    const { error: updateItemError } = await admin
      .from('receipt_import_items')
      .update({ resulting_transaction_id: txnId })
      .eq('id', item.id)
    if (updateItemError) {
      // Transaksi stoknya SUDAH berhasil (txnId ada) — ini cuma gagal mencatat
      // linknya balik ke receipt_import_items, jadi tetap dianggap committed
      // (jangan double-insert transaksi kalau di-retry), tapi harus ke-log
      // supaya ketahuan link-nya belum lengkap.
      logger.error('Gagal update resulting_transaction_id di receipt_import_items', {
        route: 'admin/receipt-imports/commit',
        business_id: importRow.business_id,
        import_id: id,
        item_id: item.id,
        transaction_id: txnId,
        error: updateItemError,
      })
    }
    committed.push(item.id)
  }

  const { error: finalizeError } = await admin
    .from('receipt_imports')
    .update({ status: 'completed' })
    .eq('id', id)
  if (finalizeError) {
    logger.error('Gagal menandai receipt_imports sebagai completed', {
      route: 'admin/receipt-imports/commit',
      business_id: importRow.business_id,
      import_id: id,
      error: finalizeError,
    })
  }

  return NextResponse.json({ committed_count: committed.length, failed })
}
