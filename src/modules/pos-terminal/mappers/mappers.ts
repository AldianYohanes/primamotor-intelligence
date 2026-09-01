import type { PosProductResponse } from '../data/response'
import { formatRupiah } from '../utils/utils'

export interface PosProductViewModel {
  id: string
  name: string
  partNumber: string
  unit: string
  sellingPrice: number
  sellingPriceFormatted: string
  availableQuantity: number
  isOutOfStock: boolean
  compatibleModels: string[]
  compatibleModelsSummary: string | null
}

export function mapPosProductResponseToViewModel(product: PosProductResponse): PosProductViewModel {
  const shown = product.compatible_models.slice(0, 2)
  const remaining = product.compatible_models.length - shown.length
  return {
    id: product.id,
    name: product.name,
    partNumber: product.part_number ?? '-',
    unit: product.unit,
    sellingPrice: product.selling_price,
    sellingPriceFormatted: formatRupiah(product.selling_price),
    availableQuantity: product.available_quantity,
    isOutOfStock: product.available_quantity <= 0,
    compatibleModels: product.compatible_models,
    compatibleModelsSummary:
      product.compatible_models.length === 0 ? null : shown.join(', ') + (remaining > 0 ? ` +${remaining} lainnya` : ''),
  }
}

export function mapPosProductListResponseToViewModels(products: PosProductResponse[]): PosProductViewModel[] {
  return products.map(mapPosProductResponseToViewModel)
}
