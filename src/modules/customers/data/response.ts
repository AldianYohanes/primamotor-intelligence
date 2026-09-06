export interface CustomerResponse {
  id: string
  name: string
  phone: string | null
  credit_limit: number
  balance: number
  notes: string | null
  created_at: string
}

export interface CustomerSaleResponse {
  id: string
  sale_number: string | null
  total_amount: number
  status: 'completed' | 'voided'
  created_at: string
}

export interface CustomerPaymentResponse {
  id: string
  amount: number
  payment_method: string
  notes: string | null
  created_at: string
  staff: { full_name: string } | null
}

export interface CustomerDetailResponse {
  customer: CustomerResponse
  recentSales: CustomerSaleResponse[]
  payments: CustomerPaymentResponse[]
}
