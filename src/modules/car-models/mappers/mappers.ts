import type { CarModelResponse } from '../data/response'

export interface CarModelViewModel {
  id: string
  brand: string
  name: string
  eraGroup: string
  yearRange: string
}

export function mapCarModelResponseToViewModel(m: CarModelResponse): CarModelViewModel {
  const yearRange = m.year_start && m.year_end ? `${m.year_start}–${m.year_end}` : m.year_start ? `${m.year_start}–sekarang` : '-'
  return {
    id: m.id,
    brand: m.brand,
    name: m.name,
    eraGroup: m.era_group ?? '-',
    yearRange,
  }
}

export function mapCarModelListResponseToViewModels(list: CarModelResponse[]): CarModelViewModel[] {
  return list.map(mapCarModelResponseToViewModel)
}
