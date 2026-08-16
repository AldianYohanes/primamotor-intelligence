export interface SupplierResponse {
  id: string
  business_id: string
  name: string
  contact_person: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type SupplierListResponse = PaginatedResponse<SupplierResponse>
