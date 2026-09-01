import useSWR from 'swr'
import { fetchShifts } from '../services/pos-shifts'
import type { ShiftListParams } from '../data/params'
import { mapShiftListToViewModels } from '../mappers/mappers'

export function useGetShifts(params: ShiftListParams) {
  const { data, error, isLoading } = useSWR(['/api/admin/pos/shifts', params], ([, p]) => fetchShifts(p), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  return {
    shifts: data ? mapShiftListToViewModels(data.shifts) : [],
    isLoading,
    error: error as Error | undefined,
  }
}
