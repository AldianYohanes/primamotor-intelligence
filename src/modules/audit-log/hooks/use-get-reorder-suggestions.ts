import useSWR from 'swr'
import { fetchReorderSuggestions } from '../services/reorder-suggestions'
import type { ReorderSuggestionListParams } from '../data/reorder-params'
import { mapReorderSuggestionListResponseToViewModels } from '../mappers/reorder-mappers'

export function useGetReorderSuggestions(params: ReorderSuggestionListParams) {
  const key = ['/api/admin/reorder-suggestions', params] as const

  const { data, error, isLoading, mutate } = useSWR(key, ([, p]) => fetchReorderSuggestions(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    suggestions: data ? mapReorderSuggestionListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
