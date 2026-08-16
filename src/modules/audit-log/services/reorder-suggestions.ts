import type { ReorderSuggestionListParams } from '../data/reorder-params'
import { buildReorderSuggestionListQueryString } from '../data/reorder-params'
import type { ReorderSuggestionListResponse, ReorderSuggestionResponse, ReorderStatus } from '../data/reorder-response'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchReorderSuggestions(params: ReorderSuggestionListParams): Promise<ReorderSuggestionListResponse> {
  const res = await fetch(`/api/admin/reorder-suggestions?${buildReorderSuggestionListQueryString(params)}`)
  return parseJsonOrThrow<ReorderSuggestionListResponse>(res)
}

export async function updateReorderSuggestionStatus(
  id: string,
  status: Exclude<ReorderStatus, 'pending'>
): Promise<{ suggestion: ReorderSuggestionResponse }> {
  const res = await fetch(`/api/admin/reorder-suggestions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return parseJsonOrThrow<{ suggestion: ReorderSuggestionResponse }>(res)
}
