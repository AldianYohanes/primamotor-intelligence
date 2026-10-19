import type {
  StockCardRow,
  StockCardSummary,
  StockTransactionInput,
  StockTransactionType,
} from '../data/response'

/**
 * Arah tiap jenis transaksi terhadap saldo. 'retur' dihitung masuk: di repo ini
 * satu-satunya jalur retur adalah klaim garansi/retur pelanggan yang menambah
 * stok (claim_warranty_return, lihat POS_README).
 */
const SIGN: Record<StockTransactionType, 1 | -1> = {
  masuk: 1,
  transfer_in: 1,
  retur: 1,
  adjustment_in: 1,
  keluar: -1,
  transfer_out: -1,
  adjustment_out: -1,
}

export const TRANSACTION_TYPE_LABELS: Record<StockTransactionType, string> = {
  masuk: 'Barang masuk',
  keluar: 'Barang keluar',
  transfer_in: 'Transfer masuk',
  transfer_out: 'Transfer keluar',
  retur: 'Retur',
  adjustment_in: 'Penyesuaian (+)',
  adjustment_out: 'Penyesuaian (−)',
}

export function signedQuantity(type: StockTransactionType, quantity: number): number {
  return SIGN[type] * Math.abs(quantity)
}

/** 'YYYY-MM-DD' (WIB) → awal hari dalam ISO UTC. null kalau format salah. */
export function startOfDayWib(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T00:00:00+07:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 'YYYY-MM-DD' (WIB) → awal hari BERIKUTNYA (batas atas eksklusif). */
export function endExclusiveWib(date: string | null | undefined): string | null {
  const start = startOfDayWib(date)
  if (!start) return null
  return new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString()
}

export interface StockCardBuildOptions {
  /** Kosong = total semua lokasi. */
  locationId?: string | null
  /** ISO, inklusif. */
  fromIso?: string | null
  /** ISO, eksklusif. */
  toIso?: string | null
  locationNames: Map<string, string>
  staffNames: Map<string, string>
}

/**
 * Susun kartu stok dari riwayat transaksi satu produk. Saldo dihitung dari
 * SELURUH riwayat (urut waktu), jadi saldo awal periode benar walau filter
 * tanggal dipakai. Hasil `rows` diurutkan dari yang terbaru.
 */
export function buildStockCard(
  transactions: StockTransactionInput[],
  opts: StockCardBuildOptions,
): { rows: StockCardRow[]; summary: StockCardSummary } {
  const scoped = transactions
    .filter((t) => !opts.locationId || t.location_id === opts.locationId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))

  let balance = 0
  let opening = 0
  let totalIn = 0
  let totalOut = 0
  const rows: StockCardRow[] = []

  for (const t of scoped) {
    const delta = signedQuantity(t.transaction_type, t.quantity)
    const beforeRange = !!opts.fromIso && t.created_at < opts.fromIso
    const afterRange = !!opts.toIso && t.created_at >= opts.toIso
    if (afterRange) break
    balance += delta
    if (beforeRange) {
      opening = balance
      continue
    }
    if (delta > 0) totalIn += delta
    else totalOut += -delta
    rows.push({
      id: t.id,
      created_at: t.created_at,
      location_id: t.location_id,
      location_name: opts.locationNames.get(t.location_id) ?? '(lokasi tidak ditemukan)',
      transaction_type: t.transaction_type,
      quantity_in: delta > 0 ? delta : 0,
      quantity_out: delta < 0 ? -delta : 0,
      balance,
      notes: t.notes,
      staff_name: t.staff_id ? (opts.staffNames.get(t.staff_id) ?? null) : null,
      via_agent: !!t.agent_audit_log_id,
    })
  }

  return {
    rows: rows.reverse(),
    summary: {
      opening_balance: opening,
      total_in: totalIn,
      total_out: totalOut,
      closing_balance: balance,
    },
  }
}
