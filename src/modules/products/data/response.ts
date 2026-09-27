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
  // Dipakai Monitoring Agent (lihat app/api/cron/monitor/route.ts) untuk
  // hitung reorder point — sebelumnya kolom ini sudah ada di DB & dipakai
  // mappers.ts, tapi belum dideklarasikan di sini (gap type-safety, lihat
  // TODO §"Gap lain" — ProductResponse belum punya lead_time_days/safety_stock).
  lead_time_days: number | null
  safety_stock: number | null
  unit_cost: number
  selling_price: number
  preferred_supplier_id: string | null
  is_active: boolean
  // Migration 0028 — null = garansi tidak dilacak utk produk ini (default).
  warranty_days: number | null
  created_at: string
  updated_at: string
  suppliers: { name: string } | null
  // §15.4 — hasil join product_aliases(alias) di GET list.
  product_aliases: { alias: string }[]
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type ProductListResponse = PaginatedResponse<ProductResponse>
