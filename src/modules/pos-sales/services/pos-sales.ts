import type { SaleListParams } from '../data/params'
import { buildSaleListQueryString } from '../data/params'
import type { SaleListResponse, SaleDetailResponse } from '../data/response'
import type { VoidSalePayload } from '../data/payload'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchSales(params: SaleListParams): Promise<SaleListResponse> {
  const res = await fetch(`/api/admin/pos/sales?${buildSaleListQueryString(params)}`)
  return parseJsonOrThrow<SaleListResponse>(res)
}

export async function fetchSaleDetail(id: string): Promise<SaleDetailResponse> {
  const res = await fetch(`/api/admin/pos/sales/${id}`)
  return parseJsonOrThrow<SaleDetailResponse>(res)
}

export async function voidSale(id: string, payload: VoidSalePayload): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/pos/sales/${id}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ ok: true }>(res)
}

export async function claimWarranty(
  saleId: string,
  itemId: string,
  payload: { reason: string; resolution: 'replaced' | 'refunded' | 'repaired' },
): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/pos/sales/${saleId}/items/${itemId}/warranty-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ ok: true }>(res)
}
