import type { ShiftListParams } from '../data/params'
import { buildShiftListQueryString } from '../data/params'
import type { ShiftResponse, ShiftReportResponse } from '../data/response'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchShifts(params: ShiftListParams): Promise<{ shifts: ShiftResponse[] }> {
  const res = await fetch(`/api/admin/pos/shifts?${buildShiftListQueryString(params)}`)
  return parseJsonOrThrow<{ shifts: ShiftResponse[] }>(res)
}

export async function fetchShiftReport(shiftId: string): Promise<ShiftReportResponse> {
  const res = await fetch(`/api/admin/pos/shifts/${shiftId}/report`)
  return parseJsonOrThrow<ShiftReportResponse>(res)
}
