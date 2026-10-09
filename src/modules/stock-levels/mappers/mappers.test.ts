import { describe, it, expect } from 'vitest'
import { buildStockLevelRows } from './mappers'

const loc = [
  { id: 'lt', name: 'Toko', type: 'toko' as const },
  { id: 'lg', name: 'Gudang', type: 'gudang' as const },
]
const prod = (id: string, min: number | null) => ({
  id,
  name: `Produk ${id}`,
  part_number: null,
  category: null,
  unit: 'pcs',
  min_threshold: min,
})

describe('buildStockLevelRows', () => {
  it('pivots stock into one cell per location, missing row = 0', () => {
    const rows = buildStockLevelRows(
      [prod('p1', 0)],
      loc,
      [{ product_id: 'p1', location_id: 'lt', quantity: 10, reserved_quantity: 3 }],
    )
    expect(rows[0].locations.map((c) => [c.name, c.quantity, c.reserved_quantity, c.available_quantity])).toEqual([
      ['Toko', 10, 3, 7],
      ['Gudang', 0, 0, 0],
    ])
  })

  it('sums totals across locations', () => {
    const rows = buildStockLevelRows(
      [prod('p1', 0)],
      loc,
      [
        { product_id: 'p1', location_id: 'lt', quantity: 10, reserved_quantity: 3 },
        { product_id: 'p1', location_id: 'lg', quantity: 5, reserved_quantity: 0 },
      ],
    )
    expect(rows[0].totals).toEqual({ quantity: 15, reserved_quantity: 3, available_quantity: 12 })
  })

  it('flags low stock when total available <= threshold', () => {
    const stock = [{ product_id: 'p1', location_id: 'lt', quantity: 5, reserved_quantity: 0 }]
    expect(buildStockLevelRows([prod('p1', 5)], loc, stock)[0].is_low).toBe(true)
    expect(buildStockLevelRows([prod('p1', 4)], loc, stock)[0].is_low).toBe(false)
  })

  it('never flags low when threshold is null; flags 0 stock with threshold 0', () => {
    expect(buildStockLevelRows([prod('p1', null)], loc, [])[0].is_low).toBe(false)
    expect(buildStockLevelRows([prod('p1', 0)], loc, [])[0].is_low).toBe(true)
  })

  it('ignores stock rows of other products', () => {
    const rows = buildStockLevelRows(
      [prod('p1', 0)],
      loc,
      [{ product_id: 'p2', location_id: 'lt', quantity: 99, reserved_quantity: 0 }],
    )
    expect(rows[0].totals.quantity).toBe(0)
  })
})
