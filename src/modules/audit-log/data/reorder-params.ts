import type { ReorderStatus } from './reorder-response'

export type ReorderStatusFilter = ReorderStatus | 'all'

export interface ReorderSuggestionListParams {
  page: number
  pageSize: number
  status?: ReorderStatusFilter
}

export function buildReorderSuggestionListQueryString(params: ReorderSuggestionListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  if (params.status && params.status !== 'all') sp.set('status', params.status)
  return sp.toString()
}
