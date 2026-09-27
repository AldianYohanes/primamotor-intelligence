import { describe, it, expect } from 'vitest'
import { can, modulesFor, safeRedirect } from './rbac'

describe('can() — matriks hak akses sesuai naskah bab 3', () => {
  it('staf kasir hanya chat & POS', () => {
    expect(can('staff', 'chat.use')).toBe(true)
    expect(can('staff', 'pos.use')).toBe(true)
    expect(can('staff', 'portal.access')).toBe(false)
    expect(can('staff', 'pos.manage')).toBe(false)
    expect(can('staff', 'staff.manage')).toBe(false)
    expect(can('staff', 'tenant.switch')).toBe(false)
  })

  it('owner punya Portal Admin tapi tidak lintas tenant', () => {
    expect(can('owner', 'portal.access')).toBe(true)
    expect(can('owner', 'pos.manage')).toBe(true)
    expect(can('owner', 'staff.manage')).toBe(true)
    expect(can('owner', 'tenant.switch')).toBe(false)
    expect(can('owner', 'tenant.approve')).toBe(false)
  })

  it('super admin punya semua izin', () => {
    expect(can('admin', 'tenant.switch')).toBe(true)
    expect(can('admin', 'tenant.approve')).toBe(true)
    expect(can('admin', 'portal.access')).toBe(true)
  })

  it('role kosong tidak punya izin apa pun', () => {
    expect(can(null, 'chat.use')).toBe(false)
    expect(can(undefined, 'pos.use')).toBe(false)
  })
})

describe('modulesFor() — isi menu pilih', () => {
  const keys = (role: Parameters<typeof modulesFor>[0]) => modulesFor(role).map((m) => m.key)

  it('kasir tidak melihat Portal Admin', () => {
    expect(keys('staff')).toEqual(['chat', 'pos'])
  })
  it('owner melihat Portal Admin', () => {
    expect(keys('owner')).toEqual(['chat', 'pos', 'portal'])
  })
  it('super admin juga melihat Kelola Tenant', () => {
    expect(keys('admin')).toEqual(['chat', 'pos', 'portal', 'tenants'])
  })
  it('Evaluasi hanya muncul kalau tersedia di tenant aktif', () => {
    expect(modulesFor('staff', { evalAvailable: true }).map((m) => m.key)).toEqual(['chat', 'pos', 'eval'])
  })
})

describe('safeRedirect() — cegah open redirect setelah login', () => {
  it('menerima path internal', () => {
    expect(safeRedirect('/pos')).toBe('/pos')
    expect(safeRedirect('/admin/products?page=2')).toBe('/admin/products?page=2')
  })
  it('menolak URL eksternal dan protocol-relative', () => {
    expect(safeRedirect('https://evil.com')).toBeNull()
    expect(safeRedirect('//evil.com')).toBeNull()
    expect(safeRedirect('/\\evil.com')).toBeNull()
    expect(safeRedirect('javascript:alert(1)')).toBeNull()
  })
  it('menolak kosong dan loop ke halaman login', () => {
    expect(safeRedirect(null)).toBeNull()
    expect(safeRedirect('')).toBeNull()
    expect(safeRedirect('/login?redirect=/pos')).toBeNull()
  })
})
