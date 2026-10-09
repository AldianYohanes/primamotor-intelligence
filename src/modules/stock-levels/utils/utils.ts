export interface AdjustmentInput {
  /** Isi input "Jumlah baru" apa adanya (string). */
  newQuantity: string
  reservedQuantity: number
  reason: string
}

export interface AdjustmentValidation {
  ok: boolean
  value: number | null
  errors: { quantity?: string; reason?: string }
}

export function validateAdjustment(input: AdjustmentInput): AdjustmentValidation {
  const errors: AdjustmentValidation['errors'] = {}
  const raw = input.newQuantity.trim()
  let value: number | null = null

  if (raw === '') {
    errors.quantity = 'Isi jumlah baru.'
  } else if (!/^\d+$/.test(raw)) {
    errors.quantity = 'Jumlah harus bilangan bulat, 0 atau lebih.'
  } else {
    const n = Number(raw)
    if (!Number.isSafeInteger(n)) {
      errors.quantity = 'Jumlah terlalu besar.'
    } else if (n < input.reservedQuantity) {
      errors.quantity = `Jumlah tidak boleh di bawah ${input.reservedQuantity} unit yang sedang ditahan.`
    } else {
      value = n
    }
  }

  if (input.reason.trim() === '') errors.reason = 'Alasan wajib diisi.'

  return { ok: Object.keys(errors).length === 0, value, errors }
}

export function formatDifference(diff: number): string {
  if (diff > 0) return `+${diff}`
  if (diff < 0) return `−${Math.abs(diff)}`
  return '0'
}
