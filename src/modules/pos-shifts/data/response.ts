export type ShiftStatus = 'open' | 'closed'

export interface ShiftResponse {
  id: string
  location_id: string
  staff_id: string
  opening_cash: number
  closing_cash: number | null
  expected_cash: number | null
  cash_variance: number | null
  status: ShiftStatus
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
