export interface UpdateImportItemPayload {
  matched_product_id?: string | null
  suggested_quantity?: number
  status?: 'unmatched' | 'matched' | 'confirmed' | 'rejected'
}
