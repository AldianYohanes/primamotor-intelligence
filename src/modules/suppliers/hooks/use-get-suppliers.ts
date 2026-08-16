import useSWR from 'swr'
import { fetchSuppliers } from '../services/suppliers'
import type { SupplierListParams } from '../data/params'
import { mapSupplierListResponseToViewModels } from '../mappers/mappers'

export function useGetSuppliers(params: SupplierListParams) {
  const key = ['/api/admin/suppliers', params] as const

  const { data, error, isLoading, mutate } = useSWR(key, ([, p]) => fetchSuppliers(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    suppliers: data ? mapSupplierListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
