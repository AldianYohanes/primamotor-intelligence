export function formatPeriodLabel(period: string): string {
  return new Date(period).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
}
