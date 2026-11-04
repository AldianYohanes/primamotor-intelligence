import useSWR from 'swr'
import { fetchReorderSuggestions } from '@/src/modules/audit-log/services/reorder-suggestions'
import type { ReorderSuggestionListParams } from '@/src/modules/audit-log/data/reorder-params'

/** Versi mentah (tanpa view model) karena halaman ini butuh trend_snapshot. */
export function useReorderList(params: ReorderSuggestionListParams) {
  const { data, error, isLoading, mutate } = useSWR(
    ['/api/admin/reorder-suggestions', params] as const,
    ([, p]) => fetchReorderSuggestions(p),
    { keepPreviousData: true, revalidateOnFocus: false },
  )
  return {
    items: data?.data ?? [],
    pageInfo: data ? { page: data.page, totalPages: data.totalPages, total: data.total } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
