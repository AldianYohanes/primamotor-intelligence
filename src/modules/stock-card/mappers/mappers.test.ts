import { describe, it, expect } from 'vitest'
import { buildStockCard, endExclusiveWib, signedQuantity, startOfDayWib } from './mappers'
import type { StockTransactionInput } from '../data/response'

const tx = (
  id: string,
  type: StockTransactionInput['transaction_type'],
  quantity: number,
  at: string,
  location_id = 'lt',
  extra: Partial<StockTransactionInput> = {},
): StockTransactionInput => ({
  id,
  location_id,
  transaction_type: type,
  quantity,
  notes: null,
  staff_id: null,
  agent_audit_log_id: null,
  created_at: at,
  ...extra,
})

const names = {
  locationNames: new Map([
    ['lt', 'Toko'],
    ['lg', 'Gudang'],
  ]),
  staffNames: new Map([['s1', 'Budi']]),
}

describe('signedQuantity', () => {
  it('masuk/transfer masuk/retur/penyesuaian + menambah, sisanya mengurangi', () => {
    expect(signedQuantity('masuk', 5)).toBe(5)
    expect(signedQuantity('retur', 2)).toBe(2)
    expect(signedQuantity('adjustment_in', 1)).toBe(1)
    expect(signedQuantity('transfer_in', 3)).toBe(3)
    expect(signedQuantity('keluar', 4)).toBe(-4)
    expect(signedQuantity('transfer_out', 3)).toBe(-3)
    expect(signedQuantity('adjustment_out', 1)).toBe(-1)
  })
})

describe('buildStockCard', () => {
  const all = [
    tx('3', 'keluar', 4, '2026-10-03T03:00:00Z'),
    tx('1', 'masuk', 10, '2026-10-01T03:00:00Z'),
    tx('2', 'transfer_out', 3, '2026-10-02T03:00:00Z'),
    tx('2b', 'transfer_in', 3, '2026-10-02T03:00:00Z', 'lg'),
    tx('4', 'adjustment_out', 1, '2026-10-04T03:00:00Z', 'lt', { agent_audit_log_id: 'a1', staff_id: 's1' }),
  ]

  it('menghitung saldo berjalan per lokasi, terbaru di atas', () => {
    const { rows, summary } = buildStockCard(all, { ...names, locationId: 'lt' })
    expect(rows.map((r) => [r.id, r.balance])).toEqual([
      ['4', 2],
      ['3', 3],
      ['2', 7],
      ['1', 10],
    ])
    expect(summary).toEqual({ opening_balance: 0, total_in: 10, total_out: 8, closing_balance: 2 })
  })

  it('tanpa filter lokasi, transfer saling meniadakan di total', () => {
    const { summary } = buildStockCard(all, names)
    expect(summary.closing_balance).toBe(5)
  })

  it('filter periode: saldo awal berasal dari riwayat sebelum periode', () => {
    const { rows, summary } = buildStockCard(all, {
      ...names,
      locationId: 'lt',
      fromIso: '2026-10-03T00:00:00Z',
      toIso: '2026-10-04T00:00:00Z',
    })
    expect(summary).toEqual({ opening_balance: 7, total_in: 0, total_out: 4, closing_balance: 3 })
    expect(rows).toHaveLength(1)
    expect(rows[0].balance).toBe(3)
  })

  it('menandai transaksi dari chat agent dan nama staf', () => {
    const { rows } = buildStockCard(all, { ...names, locationId: 'lt' })
    expect(rows[0].via_agent).toBe(true)
    expect(rows[0].staff_name).toBe('Budi')
    expect(rows[1].via_agent).toBe(false)
  })

  it('riwayat kosong', () => {
    const { rows, summary } = buildStockCard([], names)
    expect(rows).toEqual([])
    expect(summary.closing_balance).toBe(0)
  })
})

describe('batas tanggal WIB', () => {
  it('awal hari WIB = 17:00 UTC hari sebelumnya', () => {
    expect(startOfDayWib('2026-10-02')).toBe('2026-10-01T17:00:00.000Z')
    expect(endExclusiveWib('2026-10-02')).toBe('2026-10-02T17:00:00.000Z')
  })
  it('format salah → null', () => {
    expect(startOfDayWib('besok')).toBeNull()
    expect(startOfDayWib(null)).toBeNull()
  })
})
