export interface SnapshotFacts {
  /** Stok tersedia (semua lokasi) saat saran dibuat. */
  stockAtSuggestion: number | null
  /** Titik pesan ulang yang dihitung Monitoring Agent. */
  reorderPoint: number | null
  /** Rata-rata keluar per hari (jendela pengamatan). */
  averageDailyOutbound: number | null
  observationDays: number | null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Ambil angka penting dari trend_snapshot (jsonb bebas bentuk) tanpa percaya tipenya. */
export function readSnapshotFacts(snapshot: unknown): SnapshotFacts {
  const s = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>) : {}
  return {
    stockAtSuggestion: num(s.total_available),
    reorderPoint: num(s.reorder_point),
    averageDailyOutbound: num(s.average_daily_outbound),
    observationDays: num(s.observation_days),
  }
}

/** Perkiraan stok habis dalam berapa hari; null kalau tidak ada penjualan. */
export function daysOfStockLeft(facts: SnapshotFacts): number | null {
  if (facts.stockAtSuggestion == null || !facts.averageDailyOutbound || facts.averageDailyOutbound <= 0) return null
  return Math.floor(facts.stockAtSuggestion / facts.averageDailyOutbound)
}
