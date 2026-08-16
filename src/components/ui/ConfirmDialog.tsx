'use client'

import { useState } from 'react'

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{message}</p>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={
              danger
                ? 'flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white disabled:opacity-50'
                : 'flex-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white disabled:opacity-50'
            }
          >
            {submitting ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
