export interface StaffResponse {
  id: string
  username: string
  full_name: string
  role: 'admin' | 'owner' | 'staff'
  is_active: boolean
  locked_until: string | null
  created_at: string
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type StaffListResponse = PaginatedResponse<StaffResponse>
