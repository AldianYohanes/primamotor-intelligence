import type { CustomerResponse, CustomerDetailResponse } from '../data/response'
import type { CreateCustomerPayload, RecordPaymentPayload } from '../data/payload'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchCustomers(q?: string): Promise<{ customers: CustomerResponse[] }> {
  const sp = new URLSearchParams()
  if (q) sp.set('q', q)
  const res = await fetch(`/api/admin/pos/customers?${sp.toString()}`)
  return parseJsonOrThrow<{ customers: CustomerResponse[] }>(res)
}

export async function fetchCustomerDetail(id: string): Promise<CustomerDetailResponse> {
  const res = await fetch(`/api/admin/pos/customers/${id}`)
  return parseJsonOrThrow<CustomerDetailResponse>(res)
}

export async function createCustomer(payload: CreateCustomerPayload): Promise<{ customer: CustomerResponse }> {
  const res = await fetch('/api/admin/pos/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ customer: CustomerResponse }>(res)
}

export async function recordCustomerPayment(id: string, payload: RecordPaymentPayload): Promise<{ ok: true; new_balance: number }> {
  const res = await fetch(`/api/admin/pos/customers/${id}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow<{ ok: true; new_balance: number }>(res)
}
