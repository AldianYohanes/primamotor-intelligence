import { describe, it, expect } from 'vitest'
import { mapCarModelResponseToViewModel } from './mappers'
import type { CarModelResponse } from '../data/response'

const base: CarModelResponse = {
  id: 'm1',
  brand: 'Volvo',
  name: '240',
  era_group: 'boxy',
  year_start: 1974,
  year_end: 1993,
}

describe('mapCarModelResponseToViewModel', () => {
  it('gabungkan year_start-year_end kalau keduanya ada', () => {
    expect(mapCarModelResponseToViewModel(base).yearRange).toBe('1974–1993')
  })

  it("model yang masih diproduksi (year_end null) tampil 'sekarang'", () => {
    const vm = mapCarModelResponseToViewModel({ ...base, year_end: null })
    expect(vm.yearRange).toBe('1974–sekarang')
  })

  it("year_start dan year_end null (tidak diketahui) fallback ke '-'", () => {
    const vm = mapCarModelResponseToViewModel({ ...base, year_start: null, year_end: null })
    expect(vm.yearRange).toBe('-')
  })

  it("era_group null fallback ke '-'", () => {
    expect(mapCarModelResponseToViewModel({ ...base, era_group: null }).eraGroup).toBe('-')
  })
})
