import useSWRMutation from 'swr/mutation'
import { createLocation } from '../services/locations'
import type { CreateLocationPayload } from '../data/payload'

export function usePostLocation() {
  const { trigger, isMutating, error } = useSWRMutation('/api/admin/locations', (_key: string, { arg }: { arg: CreateLocationPayload }) =>
    createLocation(arg)
  )

  return {
    createLocation: trigger,
    isCreating: isMutating,
    error: error as Error | undefined,
  }
}
