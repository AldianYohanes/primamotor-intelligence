import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // RPC approve_business_signup() sendiri yang menegakkan is_super_admin() di sisi DB
  // (§0021_signup.sql) — bukan sekadar dicek di kode aplikasi.
  const { error } = await supabase.rpc('approve_business_signup', { p_business_id: id })

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ ok: true })
}
