import useSWR from 'swr'
import { fetchSales } from '../services/pos-sales'
import type { SaleListParams } from '../data/params'
import { mapSaleListResponseToViewModels } from '../mappers/mappers'

export function useGetSales(params: SaleListParams) {
  const key = ['/api/admin/pos/sales', params] as const

  const { data, error, isLoading, mutate } = useSWR(key, ([, p]) => fetchSales(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    sales: data ? mapSaleListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
