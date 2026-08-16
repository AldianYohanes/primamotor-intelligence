import useSWR from 'swr'
import { fetchLocations } from '../services/locations'
import type { LocationListParams } from '../data/params'
import { mapLocationListResponseToViewModels } from '../mappers/mappers'

export function useGetLocations(params: LocationListParams) {
  const key = ['/api/admin/locations', params] as const

  const { data, error, isLoading, mutate } = useSWR(key, ([, p]) => fetchLocations(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    locations: data ? mapLocationListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
