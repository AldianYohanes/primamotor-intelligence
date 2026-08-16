import type { ImportResponse, ImportItemResponse } from '../data/response'
import { formatDateTimeID, statusLabel } from '../utils/utils'

export interface ImportViewModel {
  id: string
  status: string
  statusLabel: string
  createdAtFormatted: string
}

export interface ImportItemViewModel {
  id: string
  rawLineText: string
  productName: string | null
  suggestedQuantity: number
  status: ImportItemResponse['status']
}

export function mapImportResponseToViewModel(i: ImportResponse): ImportViewModel {
  return {
    id: i.id,
    status: i.status,
    statusLabel: statusLabel(i.status),
    createdAtFormatted: formatDateTimeID(i.created_at),
  }
}

export function mapImportListResponseToViewModels(rows: ImportResponse[]): ImportViewModel[] {
  return rows.map(mapImportResponseToViewModel)
}

export function mapImportItemResponseToViewModel(item: ImportItemResponse): ImportItemViewModel {
  return {
    id: item.id,
    rawLineText: item.raw_line_text ?? '',
    productName: item.products?.name ?? null,
    suggestedQuantity: item.suggested_quantity ?? 0,
    status: item.status,
  }
}

export function mapImportItemListResponseToViewModels(rows: ImportItemResponse[]): ImportItemViewModel[] {
  return rows.map(mapImportItemResponseToViewModel)
}
