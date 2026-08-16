import useSWRMutation from 'swr/mutation'
import { createOpname } from '../services/stock-opname'
import type { CreateOpnamePayload } from '../data/payload'

export function usePostOpname() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/stock-opname',
    (_key: string, { arg }: { arg: CreateOpnamePayload }) => createOpname(arg)
  )

  return {
    createOpname: trigger,
    isCreating: isMutating,
    error: error as Error | undefined,
  }
}
