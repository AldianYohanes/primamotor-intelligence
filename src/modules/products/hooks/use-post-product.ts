import useSWRMutation from 'swr/mutation'
import { createProduct } from '../services/products'
import type { CreateProductPayload } from '../data/payload'

/**
 * useSWRMutation (bukan useSWR biasa) — dipakai khusus untuk aksi yang dipicu
 * user (submit form), bukan data yang perlu auto-fetch saat mount. `trigger()`
 * mengembalikan promise supaya caller (Component.tsx) bisa await lalu
 * refresh() list produk dari useGetProducts setelah sukses.
 */
export function usePostProduct() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/products',
    (_key: string, { arg }: { arg: CreateProductPayload }) => createProduct(arg)
  )

  return {
    createProduct: trigger,
    isCreating: isMutating,
    error: error as Error | undefined,
  }
}
