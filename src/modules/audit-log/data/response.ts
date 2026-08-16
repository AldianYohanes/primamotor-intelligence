/**
 * Bentuk data PERSIS seperti yang dikembalikan API (app/api/admin/audit-log/route.ts).
 * product_name/location_detail/initiated_by_name/confirmed_by_name adalah field
 * hasil resolve di backend (bukan kolom asli agent_audit_log) — bisa null kalau
 * produk/lokasi/staf terkait sudah dihapus atau tidak ketemu.
 */
export type AuditToolName = 'updateStock' | 'transferStock'
export type AuditStatus = 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed'

export interface AuditLogResponse {
  id: string
  business_id: string
  conversation_id: string | null
  agent_type: string
  tool_name: AuditToolName | string
  input_params: Record<string, unknown>
  decision_reason: string | null
  requires_confirmation: boolean
  status: AuditStatus
  confirmed_by: string | null
  confirmed_at: string | null
  related_transaction_id: string | null
  created_at: string
  product_name: string | null
  location_detail: string | null
  initiated_by_name: string | null
  confirmed_by_name: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type AuditLogListResponse = PaginatedResponse<AuditLogResponse>
