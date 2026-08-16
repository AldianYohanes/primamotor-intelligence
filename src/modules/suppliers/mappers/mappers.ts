import type { SupplierResponse } from '../data/response'
import { formatContactLine } from '../utils/utils'

export interface SupplierViewModel {
  id: string
  name: string
  contactLine: string
  address: string
  raw: SupplierResponse
}

export function mapSupplierResponseToViewModel(s: SupplierResponse): SupplierViewModel {
  return {
    id: s.id,
    name: s.name,
    contactLine: formatContactLine(s.contact_person, s.phone),
    address: s.address ?? '-',
    raw: s,
  }
}

export function mapSupplierListResponseToViewModels(rows: SupplierResponse[]): SupplierViewModel[] {
  return rows.map(mapSupplierResponseToViewModel)
}
