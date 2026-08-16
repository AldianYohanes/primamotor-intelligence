import { createClient } from '@/lib/supabase/client'
import type { OpnameListParams } from '../data/params'
import { buildOpnameListQueryString } from '../data/params'
import type { OpnameListResponse, OpnameResponse, SelectOption } from '../data/response'
import type { CreateOpnamePayload } from '../data/payload'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchOpnameHistory(params: OpnameListParams): Promise<OpnameListResponse> {
  const res = await fetch(`/api/admin/stock-opname?${buildOpnameListQueryString(params)}`)
  return parseJsonOrThrow<OpnameListResponse>(res)
}

export async function createOpname(payload: CreateOpnamePayload): Promise<{ opname: OpnameResponse; transaction_id: string | null }> {
  const res = await fetch('/api/admin/stock-opname', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ opname: OpnameResponse; transaction_id: string | null }>(res)
}

/**
 * Dua fungsi ini SENGAJA langsung ke Supabase (bukan lewat Route Handler admin/*)
 * karena murni read-only dropdown yang sudah aman ditegakkan RLS-nya sendiri
 * (staf cuma bisa baca produk/lokasi tenant sendiri) — tidak ada logic tambahan
 * yang perlu dijaga di server untuk kasus ini, jadi tidak perlu route baru.
 */
export async function fetchProductOptions(): Promise<SelectOption[]> {
  const supabase = createClient()
  const { data } = await supabase.from('products').select('id, name').eq('is_active', true).order('name')
  return data ?? []
}

export async function fetchLocationOptions(): Promise<SelectOption[]> {
  const supabase = createClient()
  const { data } = await supabase.from('locations').select('id, name').order('name')
  return data ?? []
}
