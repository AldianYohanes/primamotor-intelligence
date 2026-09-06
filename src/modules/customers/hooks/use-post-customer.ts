import useSWRMutation from 'swr/mutation'
import { createCustomer } from '../services/customers'
import type { CreateCustomerPayload } from '../data/payload'

export function usePostCustomer() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/pos/customers',
    (_key: string, { arg }: { arg: CreateCustomerPayload }) => createCustomer(arg),
  )

  return { createCustomer: trigger, isCreating: isMutating, error: error as Error | undefined }
}
