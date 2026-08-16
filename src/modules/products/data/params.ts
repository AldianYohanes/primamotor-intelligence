/**
 * Parameter untuk GET /api/admin/products — dipetakan 1:1 ke query string.
 * Bentuk ini yang dikonsumsi TanStack Table lewat state pagination/sorting/
 * globalFilter di Component.tsx, lalu diteruskan ke hooks/use-get-products.ts.
 */
export type ProductStatusFilter = 'all' | 'active' | 'inactive'
export type ProductSortableColumn = 'name' | 'part_number' | 'category' | 'selling_price' | 'unit_cost' | 'min_threshold' | 'created_at'

export interface ProductListParams {
  page: number
  pageSize: number
  q?: string
  sortBy?: ProductSortableColumn
  sortDir?: 'asc' | 'desc'
  status?: ProductStatusFilter
}

export function buildProductListQueryString(params: ProductListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  if (params.q) sp.set('q', params.q)
  if (params.sortBy) sp.set('sortBy', params.sortBy)
  if (params.sortDir) sp.set('sortDir', params.sortDir)
  if (params.status && params.status !== 'all') sp.set('status', params.status)
  return sp.toString()
}
