import useSWR from 'swr'
import { searchCustomers } from '../services/pos-terminal'

export function useGetCustomers(q: string) {
  const { data, error, isLoading } = useSWR(['/api/admin/pos/customers', q], () => searchCustomers(q), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  return {
    customers: data?.customers ?? [],
    isLoading,
    error: error as Error | undefined,
  }
}
