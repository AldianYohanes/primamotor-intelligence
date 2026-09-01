/**
 * Bentuk data PERSIS seperti dikembalikan API. Dipisah dari ViewModel
 * (lihat mappers/mappers.ts) — konvensi yang sama dipakai di seluruh modul lain.
 */
export interface PosProductResponse {
  id: string
  name: string
  part_number: string | null
  unit: string
  selling_price: number
  available_quantity: number
  compatible_models: string[]
}

export interface PosProductSearchResponse {
  results: PosProductResponse[]
}

export interface CheckoutResultResponse {
  sale_id: string
  sale_number: string
  subtotal: number
  total_amount: number
  change_amount: number
  idempotent_replay: boolean
}

export interface CustomerResponse {
  id: string
  name: string
  phone: string | null
  credit_limit: number
  balance: number
  notes: string | null
  created_at: string
}

export interface ShiftResponse {
  id: string
  location_id: string
  staff_id: string
  opening_cash: number
  closing_cash: number | null
  expected_cash: number | null
  cash_variance: number | null
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  locations: { name: string } | null
  staff: { full_name: string } | null
}

export interface ShiftReportTotalsResponse {
  salesCount: number
  grossRevenue: number
  voidCount: number
  voidTotalAmount: number
  cashTotal: number
  transferTotal: number
  qrisTotal: number
  cardTotal: number
  piutangTotal: number
  expectedCash: number
}

export interface ShiftReportResponse {
  shift: ShiftResponse
  totals: ShiftReportTotalsResponse
}
