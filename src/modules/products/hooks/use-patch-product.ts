import useSWRMutation from 'swr/mutation'
import { updateProduct } from '../services/products'
import type { CreateProductPayload } from '../data/payload'

type ProductPatchArg = { id: string } & Partial<CreateProductPayload> & { is_active?: boolean }

/**
 * Bukan bagian eksplisit dari pola use-get/use-post, tapi mengikuti semangat
 * yang sama (useSWRMutation) untuk aksi PATCH: toggle Aktif/Nonaktif di kolom
 * aksi tabel, DAN edit field lengkap lewat form edit. Satu trigger generik
 * (`updateFields`) dipakai keduanya — `setProductActive` cuma helper tipis
 * di atasnya untuk kasus toggle yang paling sering dipakai.
 */
export function usePatchProduct() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/products/patch',
    (_key: string, { arg }: { arg: ProductPatchArg }) => {
      const { id, ...payload } = arg
      return updateProduct(id, payload)
    }
  )

  return {
    setProductActive: (id: string, isActive: boolean) => trigger({ id, is_active: isActive }),
    updateFields: (id: string, payload: Partial<CreateProductPayload>) => trigger({ id, ...payload }),
    isUpdating: isMutating,
    error: error as Error | undefined,
  }
}
