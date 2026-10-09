import useSWRMutation from 'swr/mutation'
import { adjustStock } from '../services/stock-levels'
import type { AdjustStockPayload } from '../data/payload'

export function useAdjustStock() {
  const { trigger, isMutating } = useSWRMutation(
    '/api/admin/stock-opname',
    (_key: string, { arg }: { arg: AdjustStockPayload }) => adjustStock(arg),
  )
  return { adjustStock: trigger, isAdjusting: isMutating }
}
