import useSWR from 'swr'
import { fetchShiftReport } from '../services/pos-shifts'

export function useGetShiftReport(shiftId: string | null) {
  const key = shiftId ? (['/api/admin/pos/shifts', shiftId, 'report'] as const) : null

  const { data, error, isLoading } = useSWR(key, ([, id]) => fetchShiftReport(id), {
    revalidateOnFocus: false,
  })

  return {
    report: data ?? null,
    isLoading,
    error: error as Error | undefined,
  }
}
