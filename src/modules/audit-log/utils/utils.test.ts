import { describe, it, expect } from 'vitest'
import { toolLabel, statusLabel, statusBadgeClass, reorderStatusLabel, reorderStatusBadgeClass } from './utils'

describe('toolLabel (agent_audit_log.tool_name)', () => {
  it('menerjemahkan nama tool internal ke label Bahasa Indonesia', () => {
    expect(toolLabel('updateStock')).toBe('Ubah Stok')
    expect(toolLabel('transferStock')).toBe('Transfer Stok')
  })

  it('fallback ke nama asli kalau tool_name tidak dikenal (tool baru belum di-map)', () => {
    expect(toolLabel('someNewTool')).toBe('someNewTool')
  })
})

describe('statusLabel & statusBadgeClass (agent_audit_log.status)', () => {
  it('setiap status agent_audit_log punya label yang jelas', () => {
    expect(statusLabel('pending')).toBe('Menunggu PIN')
    expect(statusLabel('executed')).toBe('Berhasil')
    expect(statusLabel('rejected')).toBe('Ditolak')
    expect(statusLabel('failed')).toBe('Gagal')
  })

  it('status gagal/ditolak dapat warna merah, berhasil dapat warna hijau', () => {
    expect(statusBadgeClass('failed')).toContain('red')
    expect(statusBadgeClass('rejected')).toContain('red')
    expect(statusBadgeClass('executed')).toContain('emerald')
    expect(statusBadgeClass('pending')).toContain('amber')
  })
})

describe('reorderStatusLabel & reorderStatusBadgeClass (reorder_suggestions.status)', () => {
  it('lifecycle saran restock beda dari agent_audit_log — tidak boleh ketuker', () => {
    expect(reorderStatusLabel('acknowledged')).toBe('Sudah Dilihat')
    expect(reorderStatusLabel('ordered')).toBe('Sudah Dipesan')
    expect(reorderStatusLabel('dismissed')).toBe('Diabaikan')
  })

  it('status "ordered" (selesai ditindaklanjuti) dapat warna hijau', () => {
    expect(reorderStatusBadgeClass('ordered')).toContain('emerald')
  })

  it('status "dismissed" dapat warna netral, bukan merah (bukan kegagalan, cuma diabaikan)', () => {
    expect(reorderStatusBadgeClass('dismissed')).not.toContain('red')
  })
})
