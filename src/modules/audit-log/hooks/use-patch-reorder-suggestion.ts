import useSWRMutation from 'swr/mutation'
import { updateReorderSuggestionStatus } from '../services/reorder-suggestions'
import type { ReorderStatus } from '../data/reorder-response'

export function usePatchReorderSuggestion() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/reorder-suggestions/patch',
    (_key: string, { arg }: { arg: { id: string; status: Exclude<ReorderStatus, 'pending'> } }) =>
      updateReorderSuggestionStatus(arg.id, arg.status)
  )

  return {
    updateStatus: (id: string, status: Exclude<ReorderStatus, 'pending'>) => trigger({ id, status }),
    isUpdating: isMutating,
    error: error as Error | undefined,
  }
}
