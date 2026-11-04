import type { StockCardParams, StockCardResponse } from '../data/response'

export function buildStockCardQueryString(params: StockCardParams): string {
  const sp = new URLSearchParams()
  sp.set('product_id', params.productId)
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  if (params.locationId) sp.set('location_id', params.locationId)
  if (params.from) sp.set('from', params.from)
  if (params.to) sp.set('to', params.to)
  return sp.toString()
}

export async function fetchStockCard(params: StockCardParams): Promise<StockCardResponse> {
  const res = await fetch(`/api/admin/stock-card?${buildStockCardQueryString(params)}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as StockCardResponse
}
