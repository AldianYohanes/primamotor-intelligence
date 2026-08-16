import useSWR from 'swr'
import { fetchProducts } from '../services/products'
import type { ProductListParams } from '../data/params'
import { mapProductListResponseToViewModels } from '../mappers/mappers'

/**
 * Key SWR dibuat dari params supaya cache otomatis terpisah per kombinasi
 * page/sort/filter/search — pindah halaman atau ganti sort tidak saling
 * menimpa cache satu sama lain, dan balik ke kombinasi yang sama akan
 * langsung dapat data dari cache (revalidasi tetap jalan di background).
 */
export function useGetProducts(params: ProductListParams) {
  const key = ['/api/admin/products', params] as const

  const { data, error, isLoading, isValidating, mutate } = useSWR(key, ([, p]) => fetchProducts(p), {
    keepPreviousData: true, // tabel tidak "berkedip" kosong saat pindah halaman/sort
    revalidateOnFocus: false,
  })

  return {
    products: data ? mapProductListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    isValidating,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
