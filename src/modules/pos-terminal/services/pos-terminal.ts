import type { PosProductSearchParams } from '../data/params'
import { buildPosProductSearchQueryString } from '../data/params'
import type { PosProductSearchResponse, CheckoutResultResponse, CustomerResponse, ShiftResponse, ShiftReportResponse } from '../data/response'
import type { CheckoutPayload } from '../data/payload'

/**
 * Lapisan paling bawah — cuma tahu cara bicara ke API, tidak tahu apa-apa
 * soal React/SWR/state (konsisten dengan services/products.ts dkk).
 */

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function searchPosProducts(params: PosProductSearchParams): Promise<PosProductSearchResponse> {
  const res = await fetch(`/api/admin/pos/products?${buildPosProductSearchQueryString(params)}`)
  return parseJsonOrThrow<PosProductSearchResponse>(res)
}

export async function checkoutSale(payload: CheckoutPayload): Promise<CheckoutResultResponse> {
  const res = await fetch('/api/admin/pos/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<CheckoutResultResponse>(res)
}

export async function searchCustomers(q?: string): Promise<{ customers: CustomerResponse[] }> {
  const sp = new URLSearchParams()
  if (q) sp.set('q', q)
  const res = await fetch(`/api/admin/pos/customers?${sp.toString()}`)
  return parseJsonOrThrow<{ customers: CustomerResponse[] }>(res)
}

export async function createCustomer(input: { name: string; phone?: string; credit_limit: number }): Promise<{ customer: CustomerResponse }> {
  const res = await fetch('/api/admin/pos/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJsonOrThrow<{ customer: CustomerResponse }>(res)
}

export async function fetchOpenShift(locationId: string): Promise<{ shifts: ShiftResponse[] }> {
  // mine=true wajib di sini — lihat catatan di route handler soal bug yang
  // pernah terjadi kalau parameter ini absen (admin/owner bisa dapat shift
  // milik staf lain di lokasi yang sama).
  const sp = new URLSearchParams({ status: 'open', location_id: locationId, mine: 'true' })
  const res = await fetch(`/api/admin/pos/shifts?${sp.toString()}`)
  return parseJsonOrThrow<{ shifts: ShiftResponse[] }>(res)
}

export async function openShift(input: { location_id: string; opening_cash: number }): Promise<{ shift: ShiftResponse }> {
  const res = await fetch('/api/admin/pos/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJsonOrThrow<{ shift: ShiftResponse }>(res)
}

export async function fetchShiftReport(shiftId: string): Promise<ShiftReportResponse> {
  const res = await fetch(`/api/admin/pos/shifts/${shiftId}/report`)
  return parseJsonOrThrow<ShiftReportResponse>(res)
}

export async function closeShift(shiftId: string, input: { closing_cash: number; notes?: string }): Promise<ShiftReportResponse> {
  const res = await fetch(`/api/admin/pos/shifts/${shiftId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJsonOrThrow<ShiftReportResponse>(res)
}
