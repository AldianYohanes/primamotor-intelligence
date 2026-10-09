/** Sama dengan body POST /api/admin/stock-opname (satu-satunya jalur ubah stok). */
export interface AdjustStockPayload {
  product_id: string
  location_id: string
  counted_quantity: number
  notes: string
}
