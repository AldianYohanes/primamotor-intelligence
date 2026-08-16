import type { CarModelListParams, CarModelListResponse } from '../data/response'
import { buildCarModelListQueryString } from '../data/response'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchCarModels(params: CarModelListParams): Promise<CarModelListResponse> {
  const res = await fetch(`/api/admin/car-models?${buildCarModelListQueryString(params)}`)
  return parseJsonOrThrow<CarModelListResponse>(res)
}
