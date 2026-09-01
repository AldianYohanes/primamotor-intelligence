import useSWRMutation from 'swr/mutation'
import { checkoutSale } from '../services/pos-terminal'
import type { CheckoutPayload } from '../data/payload'

export function usePostCheckout() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/pos/sales',
    (_key: string, { arg }: { arg: CheckoutPayload }) => checkoutSale(arg),
  )

  return {
    checkout: trigger,
    isCheckingOut: isMutating,
    error: error as Error | undefined,
  }
}
