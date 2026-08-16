import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: staffRow } = await supabase.from('staff').select('id').eq('auth_user_id', user.id).single()
  if (!staffRow) return NextResponse.json({ error: 'Akun staf tidak ditemukan' }, { status: 403 })

  const parsed = subscribeSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        staff_id: staffRow.id,
        endpoint: parsed.data.endpoint,
        keys: parsed.data.keys,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id,endpoint' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: staffRow } = await supabase.from('staff').select('id').eq('auth_user_id', user.id).single()
  if (!staffRow) return NextResponse.json({ error: 'Akun staf tidak ditemukan' }, { status: 403 })

  const { endpoint } = await req.json()
  await supabase
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('staff_id', staffRow.id)
    .eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
