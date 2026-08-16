export interface OpnameResponse {
  id: string
  business_id: string
  product_id: string | null
  location_id: string | null
  system_quantity: number
  counted_quantity: number
  discrepancy: number
  staff_id: string | null
  notes: string | null
  opname_date: string
  created_at: string
  products: { name: string } | null
  locations: { name: string } | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type OpnameListResponse = PaginatedResponse<OpnameResponse>

export interface SelectOption {
  id: string
  name: string
}
