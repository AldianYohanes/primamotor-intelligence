import useSWR from 'swr'
import { fetchImportDetail } from '../services/receipt-imports'
import { mapImportItemListResponseToViewModels } from '../mappers/mappers'

export function useGetImportDetail(importId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    importId ? ['/api/admin/receipt-imports/detail', importId] : null,
    ([, id]) => fetchImportDetail(id),
    { revalidateOnFocus: false }
  )

  return {
    items: data ? mapImportItemListResponseToViewModels(data.items) : [],
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
