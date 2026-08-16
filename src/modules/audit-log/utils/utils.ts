import type { AuditStatus, AuditToolName } from '../data/response'
import type { ReorderStatus } from '../data/reorder-response'

// Beda dari formatDateID di modul lain (products/staff dll) yang cuma tanggal —
// di sini butuh jam:menit juga karena riwayat aksi agent relevan urutan waktunya
// dalam hari yang sama.
export function formatDateTimeID(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const TOOL_LABELS: Record<AuditToolName, string> = {
  updateStock: 'Ubah Stok',
  transferStock: 'Transfer Stok',
}

export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName as AuditToolName] ?? toolName
}

export const STATUS_LABELS: Record<AuditStatus, string> = {
  pending: 'Menunggu PIN',
  confirmed: 'Dikonfirmasi',
  rejected: 'Ditolak',
  executed: 'Berhasil',
  failed: 'Gagal',
}

export function statusLabel(status: AuditStatus): string {
  return STATUS_LABELS[status] ?? status
}

export function statusBadgeClass(status: AuditStatus): string {
  switch (status) {
    case 'executed':
      return 'badge-emerald'
    case 'pending':
      return 'badge-amber'
    case 'failed':
    case 'rejected':
      return 'badge-red'
    default:
      return 'badge-slate'
  }
}

// --- Saran restock (Monitoring Agent) — status lifecycle beda dari audit_log
// di atas ('pending' → 'acknowledged'/'ordered'/'dismissed'), jadi map terpisah,
// bukan reuse STATUS_LABELS yang khusus agent_audit_log.
export const REORDER_STATUS_LABELS: Record<ReorderStatus, string> = {
  pending: 'Menunggu Tindak Lanjut',
  acknowledged: 'Sudah Dilihat',
  ordered: 'Sudah Dipesan',
  dismissed: 'Diabaikan',
}

export function reorderStatusLabel(status: ReorderStatus): string {
  return REORDER_STATUS_LABELS[status] ?? status
}

export function reorderStatusBadgeClass(status: ReorderStatus): string {
  switch (status) {
    case 'ordered':
      return 'badge-emerald'
    case 'pending':
      return 'badge-amber'
    case 'dismissed':
      return 'badge-slate'
    default:
      return 'badge-blue'
  }
}
