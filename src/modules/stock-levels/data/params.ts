export interface StockLevelListParams {
  page: number
  pageSize: number
  q?: string
  locationId?: string
  lowOnly?: boolean
}

export function buildStockLevelQueryString(params: StockLevelListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  if (params.q) sp.set('q', params.q)
  if (params.locationId) sp.set('location_id', params.locationId)
  if (params.lowOnly) sp.set('low_only', 'true')
  return sp.toString()
}
