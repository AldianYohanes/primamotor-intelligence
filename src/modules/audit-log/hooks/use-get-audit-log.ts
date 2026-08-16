import useSWR from 'swr'
import { fetchAuditLog } from '../services/audit-log'
import type { AuditLogListParams } from '../data/params'
import { mapAuditLogListResponseToViewModels } from '../mappers/mappers'

export function useGetAuditLog(params: AuditLogListParams) {
  const key = ['/api/admin/audit-log', params] as const

  const { data, error, isLoading, mutate } = useSWR(key, ([, p]) => fetchAuditLog(p), {
    keepPreviousData: true,
    revalidateOnFocus: false,
    // Ada aksi yang masih 'pending' menunggu PIN staf lain — refresh berkala
    // biar status ter-update tanpa staf harus manual reload halaman.
    refreshInterval: 15000,
  })

  return {
    logs: data ? mapAuditLogListResponseToViewModels(data.data) : [],
    pageInfo: data ? { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } : null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
