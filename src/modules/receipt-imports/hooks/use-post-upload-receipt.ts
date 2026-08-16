import useSWRMutation from 'swr/mutation'
import { uploadReceipt } from '../services/receipt-imports'

export function usePostUploadReceipt() {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/admin/receipt-imports/upload',
    (_key: string, { arg }: { arg: File }) => uploadReceipt(arg)
  )

  return {
    upload: trigger,
    isUploading: isMutating,
    error: error as Error | undefined,
  }
}
