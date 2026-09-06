import useSWR from 'swr'
import { fetchCustomers } from '../services/customers'
import { mapCustomerListToViewModels } from '../mappers/mappers'

export function useGetCustomers(q: string) {
  const { data, error, isLoading, mutate } = useSWR(['/api/admin/pos/customers', q], () => fetchCustomers(q), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  return {
    customers: data ? mapCustomerListToViewModels(data.customers) : [],
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
