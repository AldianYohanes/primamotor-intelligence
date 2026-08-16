import useSWRMutation from 'swr/mutation'
import { createStaff } from '../services/staff'
import type { CreateStaffPayload } from '../data/payload'

export function usePostStaff() {
  const { trigger, isMutating, error } = useSWRMutation('/api/admin/staff', (_key: string, { arg }: { arg: CreateStaffPayload }) =>
    createStaff(arg)
  )

  return {
    createStaff: trigger,
    isCreating: isMutating,
    error: error as Error | undefined,
  }
}
