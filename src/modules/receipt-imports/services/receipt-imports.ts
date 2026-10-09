import type { ImportListParams } from '../data/params'
import { buildImportListQueryString } from '../data/params'
import type {
  ImportListResponse,
  ImportDetailResponse,
  UploadReceiptResponse,
  CommitImportResponse,
} from '../data/response'
import type { UpdateImportItemPayload } from '../data/payload'
import { shrinkImage } from './shrink-image'

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null) ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export async function fetchImports(params: ImportListParams): Promise<ImportListResponse> {
  const res = await fetch(`/api/admin/receipt-imports?${buildImportListQueryString(params)}`)
  return parseJsonOrThrow<ImportListResponse>(res)
}

export async function fetchImportDetail(id: string): Promise<ImportDetailResponse> {
  const res = await fetch(`/api/admin/receipt-imports/${id}`)
  return parseJsonOrThrow<ImportDetailResponse>(res)
}

export async function uploadReceipt(file: File): Promise<UploadReceiptResponse> {
  const formData = new FormData()
  formData.append('file', await shrinkImage(file))
  const res = await fetch('/api/admin/receipt-imports', { method: 'POST', body: formData })
  if (res.status === 413) throw new Error('Foto bon terlalu besar untuk diunggah (maks. 4,5 MB). Coba foto ulang dengan resolusi lebih kecil.')
  return parseJsonOrThrow<UploadReceiptResponse>(res)
}

export async function updateImportItem(importId: string, itemId: string, payload: UpdateImportItemPayload): Promise<void> {
  const res = await fetch(`/api/admin/receipt-imports/${importId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  await parseJsonOrThrow<unknown>(res)
}

export async function commitImport(id: string): Promise<CommitImportResponse> {
  const res = await fetch(`/api/admin/receipt-imports/${id}/commit`, { method: 'POST' })
  return parseJsonOrThrow<CommitImportResponse>(res)
}
