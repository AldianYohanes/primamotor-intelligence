export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

/** Estimasi nominal cepat: uang pas, lalu pembulatan ke atas kelipatan
 * Rp 50rb terdekat (2 opsi berikutnya) — pola umum kasir Indonesia. */
export function getQuickCashAmounts(amount: number): number[] {
  if (amount <= 0) return []
  const step = 50000
  const roundedUp = Math.ceil(amount / step) * step
  const first = roundedUp === amount ? roundedUp + step : roundedUp
  return [amount, first, first + step]
}

/** Geser baris yang disorot di daftar hasil cari (panah atas/bawah). Berputar
 * di ujung; -1 berarti belum ada yang disorot. */
export function moveHighlight(current: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return -1
  if (current < 0) return delta === 1 ? 0 : length - 1
  return (current + delta + length) % length
}
