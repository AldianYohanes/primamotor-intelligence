import type { LocationType } from '../data/response'

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  toko: 'Toko',
  gudang: 'Gudang',
}

export function locationTypeLabel(type: LocationType): string {
  return LOCATION_TYPE_LABELS[type] ?? type
}
