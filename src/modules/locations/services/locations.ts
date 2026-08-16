import type { LocationListParams } from '../data/params'
import { buildLocationListQueryString } from '../data/params'
import type { LocationListResponse, LocationResponse } from '../data/response'
import type { CreateLocationPayload } from '../data/payload'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchLocations(params: LocationListParams): Promise<LocationListResponse> {
  const res = await fetch(`/api/admin/locations?${buildLocationListQueryString(params)}`)
  return parseJsonOrThrow<LocationListResponse>(res)
}

export async function createLocation(payload: CreateLocationPayload): Promise<{ location: LocationResponse }> {
  const res = await fetch('/api/admin/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ location: LocationResponse }>(res)
}

export async function updateLocation(id: string, payload: Partial<CreateLocationPayload>): Promise<{ location: LocationResponse }> {
  const res = await fetch(`/api/admin/locations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ location: LocationResponse }>(res)
}

export async function deleteLocation(id: string): Promise<void> {
  const res = await fetch(`/api/admin/locations/${id}`, { method: 'DELETE' })
  await parseJsonOrThrow<unknown>(res)
}
