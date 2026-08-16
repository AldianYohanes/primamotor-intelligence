import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  // Hanya field aman yang boleh diubah lewat endpoint ini
  const allowed = (({ is_active, role, full_name }) => ({ is_active, role, full_name }))(body)

  const { data, error } = await supabase.from('staff').update(allowed).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  return NextResponse.json({ staff: data })
}
