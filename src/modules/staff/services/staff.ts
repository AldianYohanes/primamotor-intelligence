import type { StaffListParams } from '../data/params'
import { buildStaffListQueryString } from '../data/params'
import type { StaffListResponse, StaffResponse } from '../data/response'
import type { CreateStaffPayload, UpdateStaffPayload, ResetPinPayload } from '../data/payload'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchStaff(params: StaffListParams): Promise<StaffListResponse> {
  const res = await fetch(`/api/admin/staff?${buildStaffListQueryString(params)}`)
  return parseJsonOrThrow<StaffListResponse>(res)
}

export async function createStaff(payload: CreateStaffPayload): Promise<{ staff: StaffResponse }> {
  const res = await fetch('/api/admin/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ staff: StaffResponse }>(res)
}

export async function updateStaff(id: string, payload: UpdateStaffPayload): Promise<{ staff: StaffResponse }> {
  const res = await fetch(`/api/admin/staff/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ staff: StaffResponse }>(res)
}

export async function resetStaffPin(id: string, payload: ResetPinPayload): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/staff/${id}/reset-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ ok: true }>(res)
}
