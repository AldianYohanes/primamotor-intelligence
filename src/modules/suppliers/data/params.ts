export interface SupplierListParams {
  page: number
  pageSize: number
}

export function buildSupplierListQueryString(params: SupplierListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  return sp.toString()
}
