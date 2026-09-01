import type { ShiftResponse } from '../data/response'
import { formatRupiah, formatDateTimeID } from '../utils/utils'

export interface ShiftViewModel {
  id: string
  locationName: string
  staffName: string
  statusLabel: string
  isOpen: boolean
  openingCashFormatted: string
  closingCashFormatted: string
  cashVarianceFormatted: string | null
  hasVarianceIssue: boolean
  openedAtFormatted: string
  closedAtFormatted: string | null
}

export function mapShiftToViewModel(s: ShiftResponse): ShiftViewModel {
  return {
    id: s.id,
    locationName: s.locations?.name ?? '-',
    staffName: s.staff?.full_name ?? '-',
    statusLabel: s.status === 'open' ? 'Terbuka' : 'Tertutup',
    isOpen: s.status === 'open',
    openingCashFormatted: formatRupiah(s.opening_cash),
    closingCashFormatted: s.closing_cash != null ? formatRupiah(s.closing_cash) : '-',
    cashVarianceFormatted: s.cash_variance != null ? formatRupiah(s.cash_variance) : null,
    hasVarianceIssue: s.cash_variance != null && s.cash_variance !== 0,
    openedAtFormatted: formatDateTimeID(s.opened_at),
    closedAtFormatted: s.closed_at ? formatDateTimeID(s.closed_at) : null,
  }
}

export function mapShiftListToViewModels(list: ShiftResponse[]): ShiftViewModel[] {
  return list.map(mapShiftToViewModel)
}
