import type { StaffResponse } from '../data/response'
import { isCurrentlyLocked, formatDateID } from '../utils/utils'

export interface StaffViewModel {
  id: string
  username: string
  fullName: string
  role: 'admin' | 'owner' | 'staff'
  roleLabel: string
  isActive: boolean
  isLocked: boolean
  statusLabel: string
  createdAtFormatted: string
  raw: StaffResponse
}

const ROLE_LABELS: Record<StaffResponse['role'], string> = {
  admin: 'Admin (Developer)',
  owner: 'Owner',
  staff: 'Staf',
}

export function mapStaffResponseToViewModel(staff: StaffResponse): StaffViewModel {
  const locked = isCurrentlyLocked(staff.locked_until)
  return {
    id: staff.id,
    username: staff.username,
    fullName: staff.full_name,
    role: staff.role,
    roleLabel: ROLE_LABELS[staff.role],
    isActive: staff.is_active,
    isLocked: locked,
    statusLabel: locked ? 'Terkunci' : staff.is_active ? 'Aktif' : 'Nonaktif',
    createdAtFormatted: formatDateID(staff.created_at),
    raw: staff,
  }
}

export function mapStaffListResponseToViewModels(rows: StaffResponse[]): StaffViewModel[] {
  return rows.map(mapStaffResponseToViewModel)
}
