import { createClient } from '@/lib/supabase/client'
import type { SalesTrendParams } from '../data/params'
import type { SalesTrendResponse, SelectOption } from '../data/response'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

// Read-only dropdown, sama alasannya dengan modules/stock-opname: aman langsung
// ke Supabase karena RLS sudah menegakkan isolasi tenant untuk SELECT ini.
export async function fetchProductOptions(): Promise<SelectOption[]> {
  const supabase = createClient()
  const { data } = await supabase.from('products').select('id, name').eq('is_active', true).order('name')
  return data ?? []
}

export async function fetchSalesTrend(params: SalesTrendParams): Promise<SalesTrendResponse> {
  const sp = new URLSearchParams({ product_id: params.productId, months: String(params.months ?? 12) })
  const res = await fetch(`/api/agent/tools/get-sales-trend?${sp}`)
  return parseJsonOrThrow<SalesTrendResponse>(res)
}
