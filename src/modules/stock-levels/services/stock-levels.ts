import type { StockLevelListParams } from '../data/params'
import { buildStockLevelQueryString } from '../data/params'
import type { StockLevelListResponse } from '../data/response'
import type { AdjustStockPayload } from '../data/payload'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchStockLevels(params: StockLevelListParams): Promise<StockLevelListResponse> {
  const res = await fetch(`/api/admin/stock-levels?${buildStockLevelQueryString(params)}`)
  return parseJsonOrThrow<StockLevelListResponse>(res)
}

/** Ubah stok = catat stock opname (jalur ledger yang sudah ada), bukan tulis ke tabel stock. */
export async function adjustStock(payload: AdjustStockPayload): Promise<{ transaction_id: string | null }> {
  const res = await fetch('/api/admin/stock-opname', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ transaction_id: string | null }>(res)
}
