import useSWRMutation from 'swr/mutation'
import { updateStaff, resetStaffPin } from '../services/staff'

export function usePatchStaff() {
  const { trigger, isMutating } = useSWRMutation(
    '/api/admin/staff/patch',
    (_key: string, { arg }: { arg: { id: string; is_active: boolean } }) => updateStaff(arg.id, { is_active: arg.is_active })
  )

  return {
    setStaffActive: (id: string, isActive: boolean) => trigger({ id, is_active: isActive }),
    isUpdating: isMutating,
  }
}

export function useResetStaffPin() {
  const { trigger, isMutating } = useSWRMutation(
    '/api/admin/staff/reset-pin',
    (_key: string, { arg }: { arg: { id: string; new_pin: string } }) => resetStaffPin(arg.id, { new_pin: arg.new_pin })
  )

  return {
    resetPin: (id: string, newPin: string) => trigger({ id, new_pin: newPin }),
    isResetting: isMutating,
  }
}
