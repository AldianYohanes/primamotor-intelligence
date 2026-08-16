import useSWR from 'swr'
import { fetchProductOptions } from '../services/reports'

export function useGetReportProductOptions() {
  const { data, isLoading } = useSWR('reports-product-options', fetchProductOptions)
  return { products: data ?? [], isLoading }
}
