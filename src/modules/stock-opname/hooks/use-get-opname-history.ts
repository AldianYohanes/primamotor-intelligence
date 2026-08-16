import useSWR from 'swr'
import { fetchOpnameHistory } from '../services/stock-opname'
import type { OpnameListParams } from '../data/params'
import { mapOpnameListResponseToViewModels } from '../mappers/mappers'

export function useGetOpnameHistory(params: OpnameListParams) {
  const key = ['/api/admin/stock-opname', params] as const

  const { data, error, isLoading, mutate } = useSWR(key, ([, p]) => fetchOpnameHistory(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    history: data ? mapOpnameListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
