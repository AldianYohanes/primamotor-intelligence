import type { AuditStatus, AuditToolName } from './response'

export type AuditStatusFilter = AuditStatus | 'all'
export type AuditToolFilter = AuditToolName | 'all'

export interface AuditLogListParams {
  page: number
  pageSize: number
  status?: AuditStatusFilter
  tool?: AuditToolFilter
}

export function buildAuditLogListQueryString(params: AuditLogListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  if (params.status && params.status !== 'all') sp.set('status', params.status)
  if (params.tool && params.tool !== 'all') sp.set('tool', params.tool)
  return sp.toString()
}
