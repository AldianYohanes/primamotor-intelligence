/**
 * Bentuk body yang dikirim ke POST /api/admin/products. Field opsional memang
 * dibiarkan opsional di sini (bukan default value) — default-nya jadi tanggung
 * jawab backend (lihat productSchema di route.ts), payload.ts cuma kontrak kirim.
 */
export interface CreateProductPayload {
  name: string
  part_number?: string
  category?: string
  unit?: string
  description?: string
  min_threshold?: number
  // Dipakai Monitoring Agent untuk hitung reorder point — dulu cuma diisi
  // lewat DB langsung, sekarang settable staf lewat form produk.
  lead_time_days?: number
  safety_stock?: number
  unit_cost?: number
  selling_price?: number
  preferred_supplier_id?: string
  aliases?: string[]
  // Migration 0028 — dipakai fitur klaim garansi POS (modules/pos-sales).
  warranty_days?: number
}
