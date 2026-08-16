import { describe, it, expect } from 'vitest'
import { mapProductResponseToViewModel } from './mappers'
import type { ProductResponse } from '../data/response'

const baseProduct: ProductResponse = {
  id: 'p1',
  business_id: 'b1',
  part_number: 'VP-240-01',
  name: 'Radiator 240',
  category: 'Pendingin',
  unit: 'pcs',
  description: null,
  min_threshold: 3,
  unit_cost: 150000,
  selling_price: 225000,
  preferred_supplier_id: 's1',
  is_active: true,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T10:00:00Z',
  suppliers: { name: 'Sparepart Jaya' },
}

describe('mapProductResponseToViewModel', () => {
  it('memformat harga jadi Rupiah', () => {
    const vm = mapProductResponseToViewModel(baseProduct)
    expect(vm.unitCostFormatted).toContain('150.000')
    expect(vm.sellingPriceFormatted).toContain('225.000')
  })

  it('flatten nama supplier dari relasi nested', () => {
    const vm = mapProductResponseToViewModel(baseProduct)
    expect(vm.supplierName).toBe('Sparepart Jaya')
  })

  it("fallback ke '-' kalau supplier null (belum ditentukan)", () => {
    const vm = mapProductResponseToViewModel({ ...baseProduct, suppliers: null })
    expect(vm.supplierName).toBe('-')
  })

  it('statusLabel mengikuti is_active', () => {
    expect(mapProductResponseToViewModel(baseProduct).statusLabel).toBe('Aktif')
    expect(mapProductResponseToViewModel({ ...baseProduct, is_active: false }).statusLabel).toBe('Nonaktif')
  })

  it('min_threshold null di-default jadi 0, bukan NaN/undefined', () => {
    const vm = mapProductResponseToViewModel({ ...baseProduct, min_threshold: null })
    expect(vm.minThreshold).toBe(0)
  })

  it('membawa raw response utuh untuk kebutuhan form edit (Component.tsx openEditForm)', () => {
    const vm = mapProductResponseToViewModel(baseProduct)
    expect(vm.raw).toEqual(baseProduct)
  })
})
