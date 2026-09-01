export type ShiftStatusFilter = 'all' | 'open' | 'closed'

export interface ShiftListParams {
  status?: ShiftStatusFilter
}

export function buildShiftListQueryString(params: ShiftListParams): string {
  const sp = new URLSearchParams()
  if (params.status && params.status !== 'all') sp.set('status', params.status)
  return sp.toString()
}
