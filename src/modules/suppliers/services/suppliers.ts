import type { SupplierListParams } from '../data/params'
import { buildSupplierListQueryString } from '../data/params'
import type { SupplierListResponse, SupplierResponse } from '../data/response'
import type { CreateSupplierPayload } from '../data/payload'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchSuppliers(params: SupplierListParams): Promise<SupplierListResponse> {
  const res = await fetch(`/api/admin/suppliers?${buildSupplierListQueryString(params)}`)
  return parseJsonOrThrow<SupplierListResponse>(res)
}

export async function createSupplier(payload: CreateSupplierPayload): Promise<{ supplier: SupplierResponse }> {
  const res = await fetch('/api/admin/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ supplier: SupplierResponse }>(res)
}
