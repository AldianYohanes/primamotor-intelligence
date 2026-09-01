import useSWR from 'swr'
import { fetchOpenShift } from '../services/pos-terminal'

/**
 * key null kalau locationId belum ada — sama alasannya seperti
 * use-get-pos-products (kasir harus pilih lokasi dulu).
 */
export function useGetOpenShift(locationId: string | null) {
  const key = locationId ? (['/api/admin/pos/shifts', 'open', locationId] as const) : null

  const { data, error, isLoading, mutate } = useSWR(key, ([, , loc]) => fetchOpenShift(loc), {
    revalidateOnFocus: false,
  })

  return {
    openShift: data?.shifts[0] ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
