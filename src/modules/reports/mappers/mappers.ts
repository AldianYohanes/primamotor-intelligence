import type { SalesTrendResponse } from '../data/response'
import { formatPeriodLabel } from '../utils/utils'

export interface TrendPointViewModel {
  periodLabel: string
  totalKeluar: number
}

export function mapSalesTrendResponseToViewModels(res: SalesTrendResponse): TrendPointViewModel[] {
  return res.trend.map((point) => ({
    periodLabel: formatPeriodLabel(point.period),
    totalKeluar: point.total_keluar,
  }))
}
