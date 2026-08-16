export interface OpnameListParams {
  page: number
  pageSize: number
  productId?: string
}

export function buildOpnameListQueryString(params: OpnameListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  if (params.productId) sp.set('product_id', params.productId)
  return sp.toString()
}
