export type ReorderStatus = 'pending' | 'acknowledged' | 'ordered' | 'dismissed'

export interface ReorderSuggestionResponse {
  id: string
  business_id: string
  product_id: string | null
  suggested_quantity: number
  reason: string | null
  trend_snapshot: Record<string, unknown> | null
  status: ReorderStatus
  acknowledged_by: string | null
  suggested_supplier_id: string | null
  created_at: string
  products: { name: string } | null
  suppliers: { name: string } | null
  acknowledged_by_name: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type ReorderSuggestionListResponse = PaginatedResponse<ReorderSuggestionResponse>
