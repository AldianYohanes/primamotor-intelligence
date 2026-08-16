export interface ImportResponse {
  id: string
  business_id: string
  source: 'ocr_photo' | 'excel' | 'manual'
  file_url: string | null
  ocr_provider: string | null
  status: 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed'
  uploaded_by: string | null
  created_at: string
  processed_at: string | null
}

export interface ImportItemResponse {
  id: string
  import_id: string
  raw_line_text: string | null
  matched_product_id: string | null
  suggested_quantity: number | null
  status: 'unmatched' | 'matched' | 'confirmed' | 'rejected'
  match_confidence: number | null
  reviewed_by: string | null
  resulting_transaction_id: string | null
  created_at: string
  products: { name: string; part_number: string | null } | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type ImportListResponse = PaginatedResponse<ImportResponse>

export interface ImportDetailResponse {
  import: ImportResponse
  items: ImportItemResponse[]
}

export interface UploadReceiptResponse {
  import_id: string
  items_count: number
}

export interface CommitImportResponse {
  committed_count: number
  failed: { item_id: string; error: string }[]
}
