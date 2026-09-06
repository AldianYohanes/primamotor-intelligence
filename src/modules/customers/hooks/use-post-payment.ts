import useSWRMutation from 'swr/mutation'
import { recordCustomerPayment } from '../services/customers'
import type { RecordPaymentPayload } from '../data/payload'

export function usePostCustomerPayment(customerId: string | null) {
  const { trigger, isMutating, error } = useSWRMutation(
    customerId ? `/api/admin/pos/customers/${customerId}/payments` : null,
    (_key: string, { arg }: { arg: RecordPaymentPayload }) => recordCustomerPayment(customerId as string, arg),
  )

  return { recordPayment: trigger, isRecording: isMutating, error: error as Error | undefined }
}
