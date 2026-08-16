/**
 * Bentuk data PERSIS seperti yang dikembalikan API (app/api/admin/products/route.ts).
 * Sengaja dipisah dari ViewModel (lihat mappers/mappers.ts) — response.ts adalah
 * kontrak dengan backend, ViewModel adalah bentuk yang sudah "siap pakai" untuk UI.
 */
export interface ProductResponse {
  id: string
  business_id: string
  part_number: string | null
  name: string
  category: string | null
  unit: string
  description: string | null
  min_threshold: number | null
  unit_cost: number
  selling_price: number
  preferred_supplier_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  suppliers: { name: string } | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type ProductListResponse = PaginatedResponse<ProductResponse>
