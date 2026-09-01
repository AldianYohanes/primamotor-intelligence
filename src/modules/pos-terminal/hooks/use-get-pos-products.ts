import useSWR from 'swr'
import { searchPosProducts } from '../services/pos-terminal'
import type { PosProductSearchParams } from '../data/params'
import { mapPosProductListResponseToViewModels } from '../mappers/mappers'

/**
 * key SWR sengaja null kalau location_id belum ada — kasir harus pilih lokasi
 * dulu sebelum bisa cari produk, mencegah fetch percuma ke lokasi kosong.
 */
export function useGetPosProducts(params: PosProductSearchParams | null) {
  const key = params ? (['/api/admin/pos/products', params] as const) : null

  const { data, error, isLoading } = useSWR(key, ([, p]) => searchPosProducts(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    products: data ? mapPosProductListResponseToViewModels(data.results) : [],
    isLoading,
    error: error as Error | undefined,
  }
}
