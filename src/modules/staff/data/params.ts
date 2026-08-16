export interface StaffListParams {
  page: number
  pageSize: number
}

export function buildStaffListQueryString(params: StaffListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  return sp.toString()
}
