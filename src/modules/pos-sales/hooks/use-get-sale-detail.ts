import useSWR from 'swr'
import { fetchSaleDetail } from '../services/pos-sales'
import { mapSaleDetailResponseToViewModel } from '../mappers/mappers'

/**
 * key null kalau saleId belum dipilih — dialog detail/void baru fetch begitu
 * staf klik satu baris di tabel riwayat, bukan prefetch semua detail sekaligus.
 */
export function useGetSaleDetail(saleId: string | null) {
  const key = saleId ? (['/api/admin/pos/sales', saleId] as const) : null

  const { data, error, isLoading, mutate } = useSWR(key, ([, id]) => fetchSaleDetail(id), {
    revalidateOnFocus: false,
  })

  return {
    detail: data ? mapSaleDetailResponseToViewModel(data) : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
