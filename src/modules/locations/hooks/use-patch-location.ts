import useSWRMutation from 'swr/mutation'
import { updateLocation, deleteLocation } from '../services/locations'
import type { CreateLocationPayload } from '../data/payload'

export function usePatchLocation() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/locations/patch',
    (_key: string, { arg }: { arg: { id: string; payload: Partial<CreateLocationPayload> } }) => updateLocation(arg.id, arg.payload)
  )

  return {
    updateFields: (id: string, payload: Partial<CreateLocationPayload>) => trigger({ id, payload }),
    isUpdating: isMutating,
    error: error as Error | undefined,
  }
}

export function useDeleteLocation() {
  const { trigger, isMutating, error } = useSWRMutation('/api/admin/locations/delete', (_key: string, { arg }: { arg: { id: string } }) =>
    deleteLocation(arg.id)
  )

  return {
    remove: (id: string) => trigger({ id }),
    isDeleting: isMutating,
    error: error as Error | undefined,
  }
}
