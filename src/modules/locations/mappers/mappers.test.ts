import { describe, it, expect } from 'vitest'
import { mapLocationResponseToViewModel } from './mappers'
import type { LocationResponse } from '../data/response'

const baseLocation: LocationResponse = {
  id: 'l1',
  business_id: 'b1',
  name: 'Toko Blok M',
  type: 'toko',
  address: 'Blok M Square, Jakarta Selatan',
  created_at: '2026-01-01T00:00:00Z',
}

describe('mapLocationResponseToViewModel', () => {
  it('menerjemahkan type enum ke label Bahasa Indonesia', () => {
    expect(mapLocationResponseToViewModel(baseLocation).typeLabel).toBe('Toko')
    expect(mapLocationResponseToViewModel({ ...baseLocation, type: 'gudang' }).typeLabel).toBe('Gudang')
  })

  it("address null (opsional saat create) fallback ke '-'", () => {
    expect(mapLocationResponseToViewModel({ ...baseLocation, address: null }).address).toBe('-')
  })

  it('membawa raw response untuk kebutuhan form edit', () => {
    const vm = mapLocationResponseToViewModel(baseLocation)
    expect(vm.raw).toEqual(baseLocation)
  })
})
