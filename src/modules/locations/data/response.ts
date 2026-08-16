export type LocationType = 'toko' | 'gudang'

export interface LocationResponse {
  id: string
  business_id: string
  name: string
  type: LocationType
  address: string | null
  created_at: string
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type LocationListResponse = PaginatedResponse<LocationResponse>
