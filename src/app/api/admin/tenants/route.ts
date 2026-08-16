import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET: daftar semua tenant (khusus admin/developer, ditegakkan lewat RLS —
 * pakai server client dengan sesi user, BUKAN admin client, supaya is_super_admin()
 * yang sebenarnya menegakkan otorisasi, bukan asumsi di kode aplikasi).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, slug, address, status, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ businesses: data })
}
