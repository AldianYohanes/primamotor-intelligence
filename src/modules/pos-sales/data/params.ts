export type SaleStatusFilter = 'all' | 'completed' | 'voided'
export type SaleSortableColumn = 'created_at' | 'total_amount'

export interface SaleListParams {
  page: number
  pageSize: number
  status?: SaleStatusFilter
  paymentMethod?: string
  dateFrom?: string
  dateTo?: string
  sortBy?: SaleSortableColumn
  sortDir?: 'asc' | 'desc'
}

export function buildSaleListQueryString(params: SaleListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  if (params.status && params.status !== 'all') sp.set('status', params.status)
  if (params.paymentMethod) sp.set('payment_method', params.paymentMethod)
  if (params.dateFrom) sp.set('date_from', params.dateFrom)
  if (params.dateTo) sp.set('date_to', params.dateTo)
  if (params.sortBy) sp.set('sortBy', params.sortBy)
  if (params.sortDir) sp.set('sortDir', params.sortDir)
  return sp.toString()
}
