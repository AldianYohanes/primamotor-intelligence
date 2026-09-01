/**
 * Parameter untuk GET /api/admin/pos/products — dipetakan 1:1 ke query string.
 */
export interface PosProductSearchParams {
  location_id: string
  q?: string
  limit?: number
}

export function buildPosProductSearchQueryString(params: PosProductSearchParams): string {
  const sp = new URLSearchParams()
  sp.set('location_id', params.location_id)
  if (params.q) sp.set('q', params.q)
  if (params.limit) sp.set('limit', String(params.limit))
  return sp.toString()
}
