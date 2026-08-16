import type { AuditLogResponse, AuditStatus } from '../data/response'
import { formatDateTimeID, toolLabel, statusLabel, statusBadgeClass } from '../utils/utils'

export interface AuditLogViewModel {
  id: string
  createdAtFormatted: string
  toolLabel: string
  productName: string
  locationDetail: string
  quantity: number | null
  reason: string
  status: AuditStatus
  statusLabel: string
  statusBadgeClass: string
  initiatedByName: string
  confirmedByName: string
  confirmedAtFormatted: string
}

export function mapAuditLogResponseToViewModel(log: AuditLogResponse): AuditLogViewModel {
  const quantity = typeof log.input_params.quantity === 'number' ? log.input_params.quantity : null

  return {
    id: log.id,
    createdAtFormatted: formatDateTimeID(log.created_at),
    toolLabel: toolLabel(log.tool_name),
    productName: log.product_name ?? '(produk tidak ditemukan)',
    locationDetail: log.location_detail ?? '-',
    quantity,
    reason: log.decision_reason ?? '-',
    status: log.status,
    statusLabel: statusLabel(log.status),
    statusBadgeClass: statusBadgeClass(log.status),
    initiatedByName: log.initiated_by_name ?? '-',
    confirmedByName: log.confirmed_by_name ?? '-',
    confirmedAtFormatted: log.confirmed_at ? formatDateTimeID(log.confirmed_at) : '-',
  }
}

export function mapAuditLogListResponseToViewModels(logs: AuditLogResponse[]): AuditLogViewModel[] {
  return logs.map(mapAuditLogResponseToViewModel)
}
