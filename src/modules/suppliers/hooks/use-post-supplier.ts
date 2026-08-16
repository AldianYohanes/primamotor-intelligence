import useSWRMutation from 'swr/mutation'
import { createSupplier } from '../services/suppliers'
import type { CreateSupplierPayload } from '../data/payload'

export function usePostSupplier() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/suppliers',
    (_key: string, { arg }: { arg: CreateSupplierPayload }) => createSupplier(arg)
  )

  return {
    createSupplier: trigger,
    isCreating: isMutating,
    error: error as Error | undefined,
  }
}
