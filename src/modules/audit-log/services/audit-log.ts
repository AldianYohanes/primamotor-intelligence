import type { AuditLogListParams } from '../data/params'
import { buildAuditLogListQueryString } from '../data/params'
import type { AuditLogListResponse } from '../data/response'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchAuditLog(params: AuditLogListParams): Promise<AuditLogListResponse> {
  const res = await fetch(`/api/admin/audit-log?${buildAuditLogListQueryString(params)}`)
  return parseJsonOrThrow<AuditLogListResponse>(res)
}
