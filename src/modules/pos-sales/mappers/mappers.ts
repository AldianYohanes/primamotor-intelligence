import type { SaleResponse, SaleItemResponse, SaleDetailResponse } from '../data/response'
import { formatRupiah, formatDateTimeID } from '../utils/utils'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer Bank',
  qris: 'QRIS',
  card: 'Kartu Debit/Kredit',
  split: 'Split (Gabungan)',
  piutang: 'Piutang',
}

export interface SaleViewModel {
  id: string
  shortId: string
  saleNumber: string
  locationName: string
  staffName: string
  customerName: string
  totalAmountFormatted: string
  paymentMethodLabel: string
  statusLabel: string
  isVoided: boolean
  createdAtFormatted: string
  raw: SaleResponse
}

export function mapSaleResponseToViewModel(sale: SaleResponse): SaleViewModel {
  return {
    id: sale.id,
    shortId: sale.id.slice(0, 8).toUpperCase(),
    saleNumber: sale.sale_number ?? sale.id.slice(0, 8).toUpperCase(),
    locationName: sale.locations?.name ?? '-',
    staffName: sale.staff?.full_name ?? '-',
    customerName: sale.customer_name ?? 'Walk-in',
    totalAmountFormatted: formatRupiah(sale.total_amount),
    paymentMethodLabel: PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method,
    statusLabel: sale.status === 'voided' ? 'Dibatalkan' : 'Selesai',
    isVoided: sale.status === 'voided',
    createdAtFormatted: formatDateTimeID(sale.created_at),
    raw: sale,
  }
}

export function mapSaleListResponseToViewModels(sales: SaleResponse[]): SaleViewModel[] {
  return sales.map(mapSaleResponseToViewModel)
}

export interface SaleItemViewModel {
  id: string
  productName: string
  partNumber: string
  quantity: number
  unit: string
  unitPriceFormatted: string
  subtotalFormatted: string
  warrantyUntilFormatted: string | null
  isWarrantyExpired: boolean
  isAlreadyClaimed: boolean
  claimResolutionLabel: string | null
  canClaimWarranty: boolean
}

export interface SaleDetailViewModel {
  id: string
  saleNumber: string
  locationName: string
  staffName: string
  customerName: string
  customerPhone: string
  subtotalFormatted: string
  discountAmountFormatted: string
  taxAmountFormatted: string
  totalAmountFormatted: string
  paymentMethodLabel: string
  amountPaidFormatted: string
  changeAmountFormatted: string
  statusLabel: string
  isVoided: boolean
  voidReason: string | null
  voidedAtFormatted: string | null
  notes: string
  createdAtFormatted: string
  items: SaleItemViewModel[]
}

export function mapSaleDetailResponseToViewModel(detail: SaleDetailResponse): SaleDetailViewModel {
  const s = detail.sale
  return {
    id: s.id,
    saleNumber: s.sale_number ?? s.id.slice(0, 8).toUpperCase(),
    locationName: s.locations?.name ?? '-',
    staffName: s.staff?.full_name ?? '-',
    customerName: s.customer_name ?? 'Walk-in',
    customerPhone: s.customer_phone ?? '-',
    subtotalFormatted: formatRupiah(s.subtotal),
    discountAmountFormatted: formatRupiah(s.discount_amount),
    taxAmountFormatted: formatRupiah(s.tax_amount),
    totalAmountFormatted: formatRupiah(s.total_amount),
    paymentMethodLabel: PAYMENT_LABELS[s.payment_method] ?? s.payment_method,
    amountPaidFormatted: formatRupiah(s.amount_paid),
    changeAmountFormatted: formatRupiah(s.change_amount),
    statusLabel: s.status === 'voided' ? 'Dibatalkan' : 'Selesai',
    isVoided: s.status === 'voided',
    voidReason: s.void_reason,
    voidedAtFormatted: s.voided_at ? formatDateTimeID(s.voided_at) : null,
    notes: s.notes ?? '-',
    createdAtFormatted: formatDateTimeID(s.created_at),
    items: detail.items.map(mapSaleItemToViewModel),
  }
}

const RESOLUTION_LABELS: Record<string, string> = { replaced: 'Diganti unit baru', refunded: 'Dikembalikan uang', repaired: 'Diperbaiki' }

function mapSaleItemToViewModel(item: SaleItemResponse): SaleItemViewModel {
  const isExpired = item.warranty_until ? new Date(item.warranty_until).getTime() < Date.now() : false
  const isClaimed = item.warranty_claim != null
  return {
    id: item.id,
    productName: item.products?.name ?? '-',
    partNumber: item.products?.part_number ?? '-',
    quantity: item.quantity,
    unit: item.products?.unit ?? '',
    unitPriceFormatted: formatRupiah(item.unit_price),
    subtotalFormatted: formatRupiah(item.subtotal),
    warrantyUntilFormatted: item.warranty_until ? formatDateTimeID(item.warranty_until) : null,
    isWarrantyExpired: isExpired,
    isAlreadyClaimed: isClaimed,
    claimResolutionLabel: item.warranty_claim ? (RESOLUTION_LABELS[item.warranty_claim.resolution] ?? item.warranty_claim.resolution) : null,
    canClaimWarranty: item.warranty_until != null && !isExpired && !isClaimed,
  }
}
