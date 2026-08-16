import useSWRMutation from 'swr/mutation'
import { updateImportItem } from '../services/receipt-imports'
import type { UpdateImportItemPayload } from '../data/payload'

export function usePatchImportItem(importId: string) {
  const { trigger, isMutating } = useSWRMutation(
    ['/api/admin/receipt-imports/items', importId],
    (_key, { arg }: { arg: { itemId: string; payload: UpdateImportItemPayload } }) =>
      updateImportItem(importId, arg.itemId, arg.payload)
  )

  return {
    updateItem: (itemId: string, payload: UpdateImportItemPayload) => trigger({ itemId, payload }),
    isUpdating: isMutating,
  }
}
