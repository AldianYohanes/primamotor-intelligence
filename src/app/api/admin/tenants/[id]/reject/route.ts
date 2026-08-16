import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/src/lib/logging/logger'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const supabase = await createClient()

  const { error } = await supabase.rpc('reject_business_signup', {
    p_business_id: id,
    p_reason: body.reason ?? null,
  })

  if (error) {
    logger.error('Gagal reject tenant baru', {
      route: 'admin/tenants/[id]/reject',
      business_id: id,
      error,
    })
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
