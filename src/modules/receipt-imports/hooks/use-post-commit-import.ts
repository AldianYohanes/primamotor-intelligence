import useSWRMutation from 'swr/mutation'
import { commitImport } from '../services/receipt-imports'

export function usePostCommitImport() {
  const { trigger, isMutating } = useSWRMutation('/api/admin/receipt-imports/commit', (_key: string, { arg }: { arg: string }) =>
    commitImport(arg)
  )

  return {
    commit: trigger,
    isCommitting: isMutating,
  }
}
