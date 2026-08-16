export function formatDateTimeID(iso: string): string {
  return new Date(iso).toLocaleString('id-ID')
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu',
  processing: 'Diproses',
  needs_review: 'Perlu Direview',
  completed: 'Selesai',
  failed: 'Gagal',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}
