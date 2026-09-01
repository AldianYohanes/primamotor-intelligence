import useSWRMutation from 'swr/mutation'
import { claimWarranty } from '../services/pos-sales'

export function usePostWarrantyClaim(saleId: string | null, itemId: string | null) {
  const { trigger, isMutating, error } = useSWRMutation(
    saleId && itemId ? `/api/admin/pos/sales/${saleId}/items/${itemId}/warranty-claim` : null,
    (_key: string, { arg }: { arg: { reason: string; resolution: 'replaced' | 'refunded' | 'repaired' } }) =>
      claimWarranty(saleId as string, itemId as string, arg),
  )

  return { claimWarranty: trigger, isClaiming: isMutating, error: error as Error | undefined }
}
