import useSWR from 'swr'
import { fetchStaff } from '../services/staff'
import type { StaffListParams } from '../data/params'
import { mapStaffListResponseToViewModels } from '../mappers/mappers'

export function useGetStaff(params: StaffListParams) {
  const key = ['/api/admin/staff', params] as const

  const { data, error, isLoading, mutate } = useSWR(key, ([, p]) => fetchStaff(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    staff: data ? mapStaffListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
