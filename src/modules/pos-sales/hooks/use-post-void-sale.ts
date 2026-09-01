import useSWRMutation from 'swr/mutation'
import { voidSale } from '../services/pos-sales'
import type { VoidSalePayload } from '../data/payload'

export function usePostVoidSale(saleId: string | null) {
  const { trigger, isMutating, error } = useSWRMutation(
    saleId ? `/api/admin/pos/sales/${saleId}/void` : null,
    (_key: string, { arg }: { arg: VoidSalePayload }) => voidSale(saleId as string, arg),
  )

  return {
    voidSale: trigger,
    isVoiding: isMutating,
    error: error as Error | undefined,
  }
}
