import type { ReorderSuggestionResponse, ReorderStatus } from '../data/reorder-response'
import { formatDateTimeID, reorderStatusLabel, reorderStatusBadgeClass } from '../utils/utils'

export interface ReorderSuggestionViewModel {
  id: string
  createdAtFormatted: string
  productName: string
  suggestedQuantity: number
  supplierName: string
  reason: string
  status: ReorderStatus
  statusLabel: string
  statusBadgeClass: string
  acknowledgedByName: string
  canAct: boolean
}

export function mapReorderSuggestionResponseToViewModel(s: ReorderSuggestionResponse): ReorderSuggestionViewModel {
  return {
    id: s.id,
    createdAtFormatted: formatDateTimeID(s.created_at),
    productName: s.products?.name ?? '(produk tidak ditemukan)',
    suggestedQuantity: s.suggested_quantity,
    supplierName: s.suppliers?.name ?? '-',
    reason: s.reason ?? '-',
    status: s.status,
    statusLabel: reorderStatusLabel(s.status),
    statusBadgeClass: reorderStatusBadgeClass(s.status),
    acknowledgedByName: s.acknowledged_by_name ?? '-',
    canAct: s.status === 'pending' || s.status === 'acknowledged',
  }
}

export function mapReorderSuggestionListResponseToViewModels(list: ReorderSuggestionResponse[]): ReorderSuggestionViewModel[] {
  return list.map(mapReorderSuggestionResponseToViewModel)
}
