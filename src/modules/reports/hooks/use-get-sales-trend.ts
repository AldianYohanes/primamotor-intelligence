import useSWR from 'swr'
import { fetchSalesTrend } from '../services/reports'
import { mapSalesTrendResponseToViewModels } from '../mappers/mappers'

export function useGetSalesTrend(productId: string) {
  const { data, isLoading, error } = useSWR(
    productId ? ['/api/agent/tools/get-sales-trend', productId] : null,
    ([, id]) => fetchSalesTrend({ productId: id, months: 12 }),
    { revalidateOnFocus: false }
  )

  return {
    productName: data?.product_name ?? null,
    trend: data ? mapSalesTrendResponseToViewModels(data) : [],
    isLoading,
    error: error as Error | undefined,
  }
}
