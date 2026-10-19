import useSWR from 'swr'
import { fetchStockCard } from '../services/stock-card'
import type { StockCardParams } from '../data/response'

export function useGetStockCard(params: StockCardParams) {
  const { data, error, isLoading } = useSWR(
    ['/api/admin/stock-card', params] as const,
    ([, p]) => fetchStockCard(p),
    { keepPreviousData: true, revalidateOnFocus: false },
  )

  return {
    product: data?.product ?? null,
    locations: data?.locations ?? [],
    summary: data?.summary ?? null,
    rows: data?.data ?? [],
    pageInfo: data ? { page: data.page, totalPages: data.totalPages, total: data.total } : null,
    isLoading,
    error: error as Error | undefined,
  }
}
