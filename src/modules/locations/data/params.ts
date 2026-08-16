export interface LocationListParams {
  page: number
  pageSize: number
}

export function buildLocationListQueryString(params: LocationListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  return sp.toString()
}
