export interface StockLevelLocation {
  location_id: string
  name: string
  type: 'toko' | 'gudang'
  quantity: number
  reserved_quantity: number
  available_quantity: number
}

export interface StockLevelTotals {
  quantity: number
  reserved_quantity: number
  available_quantity: number
}

export interface StockLevelRow {
  id: string
  name: string
  part_number: string | null
  category: string | null
  unit: string
  min_threshold: number | null
  locations: StockLevelLocation[]
  totals: StockLevelTotals
  /** Total tersedia <= min_threshold (false bila min_threshold tidak diisi). */
  is_low: boolean
}

export interface StockLevelLocationColumn {
  id: string
  name: string
  type: 'toko' | 'gudang'
}

export interface StockLevelListResponse {
  data: StockLevelRow[]
  /** Semua lokasi tenant (pilihan filter). */
  locations: StockLevelLocationColumn[]
  /** Lokasi yang ditampilkan sebagai kolom (sesudah filter lokasi). */
  columns: StockLevelLocationColumn[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
