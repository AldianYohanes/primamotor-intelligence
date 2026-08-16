export interface ImportListParams {
  page: number
  pageSize: number
}

export function buildImportListQueryString(params: ImportListParams): string {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize))
  return sp.toString()
}
