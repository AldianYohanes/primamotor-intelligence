import type { ProductListParams } from '../data/params'
import { buildProductListQueryString } from '../data/params'
import type { ProductListResponse, ProductResponse } from '../data/response'
import type { CreateProductPayload } from '../data/payload'

/**
 * Lapisan paling bawah: cuma tahu cara bicara ke API (fetch + error handling
 * dasar), tidak tahu apa-apa soal React/SWR/state. Dipanggil oleh hooks/,
 * bukan langsung dipanggil dari Component.tsx — supaya kalau nanti pindah dari
 * fetch ke axios, atau endpoint berubah, cuma file ini yang disentuh.
 */

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchProducts(params: ProductListParams): Promise<ProductListResponse> {
  const res = await fetch(`/api/admin/products?${buildProductListQueryString(params)}`)
  return parseJsonOrThrow<ProductListResponse>(res)
}

export async function createProduct(payload: CreateProductPayload): Promise<{ product: ProductResponse }> {
  const res = await fetch('/api/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ product: ProductResponse }>(res)
}

export async function updateProduct(id: string, payload: Partial<CreateProductPayload> & { is_active?: boolean }): Promise<{ product: ProductResponse }> {
  const res = await fetch(`/api/admin/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ product: ProductResponse }>(res)
}

export async function deactivateProduct(id: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' })
  return parseJsonOrThrow<{ ok: true }>(res)
}
