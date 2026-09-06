import type { CustomerResponse, CustomerDetailResponse } from '../data/response'
import { formatRupiah, formatDateTimeID } from '../utils/utils'

export interface CustomerViewModel {
  id: string
  name: string
  phone: string
  balanceFormatted: string
  creditLimitFormatted: string
  availableCreditFormatted: string
  hasOverdraft: boolean
  raw: CustomerResponse
}

export function mapCustomerToViewModel(c: CustomerResponse): CustomerViewModel {
  const available = c.credit_limit - c.balance
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? '-',
    balanceFormatted: formatRupiah(c.balance),
    creditLimitFormatted: formatRupiah(c.credit_limit),
    availableCreditFormatted: formatRupiah(Math.max(available, 0)),
    hasOverdraft: available < 0,
    raw: c,
  }
}

export function mapCustomerListToViewModels(list: CustomerResponse[]): CustomerViewModel[] {
  return list.map(mapCustomerToViewModel)
}

export interface CustomerDetailViewModel extends CustomerViewModel {
  recentSales: { id: string; saleNumber: string; totalFormatted: string; status: string; dateFormatted: string }[]
  payments: { id: string; amountFormatted: string; methodLabel: string; staffName: string; dateFormatted: string; notes: string }[]
}

const METHOD_LABELS: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer Bank', qris: 'QRIS', card: 'Kartu' }

export function mapCustomerDetailToViewModel(detail: CustomerDetailResponse): CustomerDetailViewModel {
  return {
    ...mapCustomerToViewModel(detail.customer),
    recentSales: detail.recentSales.map((s) => ({
      id: s.id,
      saleNumber: s.sale_number ?? s.id.slice(0, 8).toUpperCase(),
      totalFormatted: formatRupiah(s.total_amount),
      status: s.status === 'voided' ? 'Dibatalkan' : 'Selesai',
      dateFormatted: formatDateTimeID(s.created_at),
    })),
    payments: detail.payments.map((p) => ({
      id: p.id,
      amountFormatted: formatRupiah(p.amount),
      methodLabel: METHOD_LABELS[p.payment_method] ?? p.payment_method,
      staffName: p.staff?.full_name ?? '-',
      dateFormatted: formatDateTimeID(p.created_at),
      notes: p.notes ?? '-',
    })),
  }
}
