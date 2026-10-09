import useSWR from 'swr'
import { fetchStockLevels } from '../services/stock-levels'
import type { StockLevelListParams } from '../data/params'

export function useGetStockLevels(params: StockLevelListParams) {
  const { data, error, isLoading, mutate } = useSWR(
    ['/api/admin/stock-levels', params] as const,
    ([, p]) => fetchStockLevels(p),
    { keepPreviousData: true, revalidateOnFocus: false },
  )

  return {
    rows: data?.data ?? [],
    locations: data?.locations ?? [],
    columns: data?.columns ?? [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
