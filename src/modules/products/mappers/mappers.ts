import type { ProductResponse } from '../data/response'
import { formatRupiah, formatDateID } from '../utils/utils'

/**
 * ViewModel adalah bentuk yang sudah "dicerna" untuk UI — angka sudah diformat
 * jadi string Rupiah, tanggal sudah diformat lokal, nama supplier sudah di-flatten
 * dari relasi nested. coldef.tsx dan Component.tsx HANYA berurusan dengan tipe
 * ini, tidak pernah menyentuh ProductResponse mentah secara langsung.
 */
export interface ProductViewModel {
  id: string
  name: string
  partNumber: string
  category: string
  unit: string
  minThreshold: number
  unitCost: number
  unitCostFormatted: string
  sellingPrice: number
  sellingPriceFormatted: string
  supplierName: string
  isActive: boolean
  statusLabel: string
  createdAtFormatted: string
  raw: ProductResponse // dibawa serta untuk kebutuhan edit form (butuh field asli, belum diformat)
}

export function mapProductResponseToViewModel(product: ProductResponse): ProductViewModel {
  return {
    id: product.id,
    name: product.name,
    partNumber: product.part_number ?? '-',
    category: product.category ?? '-',
    unit: product.unit,
    minThreshold: product.min_threshold ?? 0,
    unitCost: product.unit_cost,
    unitCostFormatted: formatRupiah(product.unit_cost),
    sellingPrice: product.selling_price,
    sellingPriceFormatted: formatRupiah(product.selling_price),
    supplierName: product.suppliers?.name ?? '-',
    isActive: product.is_active,
    statusLabel: product.is_active ? 'Aktif' : 'Nonaktif',
    createdAtFormatted: formatDateID(product.created_at),
    raw: product,
  }
}

export function mapProductListResponseToViewModels(products: ProductResponse[]): ProductViewModel[] {
  return products.map(mapProductResponseToViewModel)
}
