'use client'

import { useState } from 'react'
import { AlertTriangle, AlertCircle } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Merah untuk aksi destruktif (nonaktifkan, hapus). Default true. */
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/**
 * Dialog konfirmasi generik untuk aksi destruktif non-PIN (nonaktifkan produk,
 * hapus supplier, dsb). Untuk aksi yang mengubah data stok, JANGAN pakai ini —
 * itu wajib lewat PinConfirmDialog (lihat §7/§8 project instructions), karena
 * PIN adalah lapisan keamanan, bukan cuma UX seperti dialog ini.
 */
export function ConfirmDialog({ title, message, confirmLabel = 'Ya, lanjutkan', cancelLabel = 'Batal', danger = true, onConfirm, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan, coba lagi.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-[1px] sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-popover">
        <div className="flex items-center gap-2">
          <div
            className={
              danger
                ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600'
                : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600'
            }
          >
            <AlertTriangle size={16} />
          </div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">{message}</p>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="btn btn-secondary flex-1 py-2"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={danger ? 'btn btn-danger flex-1 py-2' : 'btn btn-primary flex-1 py-2'}
          >
            {submitting ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
