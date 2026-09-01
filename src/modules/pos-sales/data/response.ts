export type PaymentMethod = 'cash' | 'transfer' | 'qris' | 'card' | 'split' | 'piutang'
export type SaleStatus = 'completed' | 'voided'

export interface SaleResponse {
  id: string
  sale_number: string | null
  location_id: string
  staff_id: string | null
  customer_name: string | null
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  payment_method: PaymentMethod
  amount_paid: number
  change_amount: number
  status: SaleStatus
  created_at: string
  locations: { name: string } | null
  staff: { full_name: string } | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type SaleListResponse = PaginatedResponse<SaleResponse>

export interface SaleItemResponse {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  discount_amount: number
  subtotal: number
  products: { name: string; part_number: string | null; unit: string; warranty_days: number | null } | null
  warranty_until: string | null
  warranty_claim: { sale_item_id: string; resolution: string; created_at: string } | null
}

export interface SaleDetailResponse {
  sale: SaleResponse & {
    customer_phone: string | null
    voided_by: string | null
    voided_at: string | null
    void_reason: string | null
    notes: string | null
  }
  items: SaleItemResponse[]
}
