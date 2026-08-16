import type { OpnameResponse } from '../data/response'
import { formatDateID, discrepancyLabel } from '../utils/utils'

export interface OpnameViewModel {
  id: string
  productName: string
  locationName: string
  systemQuantity: number
  countedQuantity: number
  discrepancy: number
  discrepancyLabel: string
  discrepancyTone: 'neutral' | 'positive' | 'negative'
  dateFormatted: string
}

export function mapOpnameResponseToViewModel(o: OpnameResponse): OpnameViewModel {
  return {
    id: o.id,
    productName: o.products?.name ?? '-',
    locationName: o.locations?.name ?? '-',
    systemQuantity: o.system_quantity,
    countedQuantity: o.counted_quantity,
    discrepancy: o.discrepancy,
    discrepancyLabel: discrepancyLabel(o.discrepancy),
    discrepancyTone: o.discrepancy === 0 ? 'neutral' : o.discrepancy > 0 ? 'positive' : 'negative',
    dateFormatted: formatDateID(o.created_at),
  }
}

export function mapOpnameListResponseToViewModels(rows: OpnameResponse[]): OpnameViewModel[] {
  return rows.map(mapOpnameResponseToViewModel)
}
