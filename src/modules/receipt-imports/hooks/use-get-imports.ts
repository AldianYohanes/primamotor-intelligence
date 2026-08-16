import useSWR from 'swr'
import { fetchImports } from '../services/receipt-imports'
import type { ImportListParams } from '../data/params'
import { mapImportListResponseToViewModels } from '../mappers/mappers'

export function useGetImports(params: ImportListParams) {
  const key = ['/api/admin/receipt-imports', params] as const

  const { data, error, isLoading, mutate } = useSWR(key, ([, p]) => fetchImports(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    imports: data ? mapImportListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
