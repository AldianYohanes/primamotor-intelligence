import useSWR from 'swr'
import { fetchCustomerDetail } from '../services/customers'
import { mapCustomerDetailToViewModel } from '../mappers/mappers'

export function useGetCustomerDetail(customerId: string | null) {
  const key = customerId ? (['/api/admin/pos/customers', customerId] as const) : null

  const { data, error, isLoading, mutate } = useSWR(key, ([, id]) => fetchCustomerDetail(id), {
    revalidateOnFocus: false,
  })

  return {
    detail: data ? mapCustomerDetailToViewModel(data) : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
