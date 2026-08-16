import useSWR from 'swr'
import { fetchCarModels } from '../services/car-models'
import type { CarModelListParams } from '../data/response'
import { mapCarModelListResponseToViewModels } from '../mappers/mappers'

export function useGetCarModels(params: CarModelListParams) {
  const key = ['/api/admin/car-models', params] as const

  const { data, error, isLoading } = useSWR(key, ([, p]) => fetchCarModels(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    carModels: data ? mapCarModelListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
  }
}
