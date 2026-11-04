export type StockTransactionType =
  | 'masuk'
  | 'keluar'
  | 'transfer_out'
  | 'transfer_in'
  | 'retur'
  | 'adjustment_in'
  | 'adjustment_out'

/** Baris mentah dari stock_transactions (kolom yang dipakai kartu stok saja). */
export interface StockTransactionInput {
  id: string
  location_id: string
  transaction_type: StockTransactionType
  quantity: number
  notes: string | null
  staff_id: string | null
  agent_audit_log_id: string | null
  created_at: string
}

export interface StockCardRow {
  id: string
  created_at: string
  location_id: string
  location_name: string
  transaction_type: StockTransactionType
  /** Jumlah masuk (0 kalau baris ini mengurangi stok). */
  quantity_in: number
  /** Jumlah keluar (0 kalau baris ini menambah stok). */
  quantity_out: number
  /** Saldo setelah baris ini (per lokasi terpilih, atau total semua lokasi). */
  balance: number
  notes: string | null
  staff_name: string | null
  /** true = dicatat lewat chat agent (ada agent_audit_log_id). */
  via_agent: boolean
}

export interface StockCardSummary {
  opening_balance: number
  total_in: number
  total_out: number
  closing_balance: number
}

export interface StockCardResponse {
  product: { id: string; name: string; part_number: string | null; unit: string }
  locations: { id: string; name: string }[]
  summary: StockCardSummary
  /** Urut dari yang terbaru. */
  data: StockCardRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface StockCardParams {
  productId: string
  page: number
  pageSize: number
  locationId?: string
  /** YYYY-MM-DD, jam Waktu Indonesia Barat. */
  from?: string
  to?: string
}
