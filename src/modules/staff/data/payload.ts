export interface CreateStaffPayload {
  username: string
  full_name: string
  role: 'owner' | 'staff' // 'admin' sengaja tidak bisa dibuat lewat form ini
  pin: string
}

export interface UpdateStaffPayload {
  is_active?: boolean
  role?: 'admin' | 'owner' | 'staff'
  full_name?: string
}

export interface ResetPinPayload {
  new_pin: string
}
