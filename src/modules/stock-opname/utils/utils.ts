export function formatDateID(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function discrepancyLabel(discrepancy: number): string {
  return discrepancy > 0 ? `+${discrepancy}` : String(discrepancy)
}
