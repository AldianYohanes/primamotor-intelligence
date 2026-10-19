import { describe, it, expect } from 'vitest'
import { daysOfStockLeft, readSnapshotFacts } from './snapshot'

describe('readSnapshotFacts', () => {
  it('membaca angka dari snapshot Monitoring Agent', () => {
    const f = readSnapshotFacts({
      total_available: 4,
      reorder_point: 10,
      average_daily_outbound: 0.5,
      observation_days: 90,
    })
    expect(f).toEqual({ stockAtSuggestion: 4, reorderPoint: 10, averageDailyOutbound: 0.5, observationDays: 90 })
  })
  it('aman untuk snapshot kosong atau bentuk aneh', () => {
    expect(readSnapshotFacts(null).stockAtSuggestion).toBeNull()
    expect(readSnapshotFacts('x').reorderPoint).toBeNull()
    expect(readSnapshotFacts({ total_available: '4' }).stockAtSuggestion).toBeNull()
  })
})

describe('daysOfStockLeft', () => {
  it('stok dibagi rata-rata keluar harian, dibulatkan ke bawah', () => {
    expect(daysOfStockLeft({ stockAtSuggestion: 4, reorderPoint: null, averageDailyOutbound: 0.5, observationDays: 90 })).toBe(8)
  })
  it('null kalau tidak ada penjualan', () => {
    expect(daysOfStockLeft({ stockAtSuggestion: 4, reorderPoint: null, averageDailyOutbound: 0, observationDays: 90 })).toBeNull()
  })
})
