import useSWR from 'swr'
import { fetchProductOptions, fetchLocationOptions } from '../services/stock-opname'

export function useGetOpnameFormOptions() {
  const products = useSWR('opname-product-options', fetchProductOptions)
  const locations = useSWR('opname-location-options', fetchLocationOptions)

  return {
    products: products.data ?? [],
    locations: locations.data ?? [],
    isLoading: products.isLoading || locations.isLoading,
  }
}
