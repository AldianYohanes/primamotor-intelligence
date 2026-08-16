export interface CarModelResponse {
  id: string
  brand: string
  name: string
  era_group: string | null
  year_start: number | null
  year_end: number | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type CarModelListResponse = PaginatedResponse<CarModelResponse>

export interface CarModelListParams {
  page: number
  pageSize: number
  q?: string
}

export function buildCarModelListQueryString(params: CarModelListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  if (params.q) sp.set('q', params.q)
  return sp.toString()
}
