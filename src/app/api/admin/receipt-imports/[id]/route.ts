import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: importRow, error: importError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from('receipt_imports').select('*').eq('id', id).single(),
    supabase
      .from('receipt_import_items')
      .select('*, products(name, part_number)')
      .eq('import_id', id)
      .order('created_at'),
  ])

  if (importError || !importRow) return NextResponse.json({ error: 'Import tidak ditemukan' }, { status: 404 })
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  return NextResponse.json({ import: importRow, items })
}
