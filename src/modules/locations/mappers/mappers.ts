import type { LocationResponse } from '../data/response'
import { locationTypeLabel } from '../utils/utils'

export interface LocationViewModel {
  id: string
  name: string
  typeLabel: string
  address: string
  raw: LocationResponse
}

export function mapLocationResponseToViewModel(loc: LocationResponse): LocationViewModel {
  return {
    id: loc.id,
    name: loc.name,
    typeLabel: locationTypeLabel(loc.type),
    address: loc.address ?? '-',
    raw: loc,
  }
}

export function mapLocationListResponseToViewModels(list: LocationResponse[]): LocationViewModel[] {
  return list.map(mapLocationResponseToViewModel)
}
