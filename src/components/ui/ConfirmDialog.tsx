'use client'

import { useState } from 'react'
import { AlertTriangle, AlertCircle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/src/components/ui/alert-dialog'
import { Button } from '@/src/components/ui/button'

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
 *
 * Dibangun di atas AlertDialog (Radix): fokus terkunci di dialog, Esc menutup,
 * fokus awal jatuh ke tombol Batal supaya Enter tidak sengaja menjalankan aksi.
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
    <AlertDialog open onOpenChange={(open) => { if (!open && !submitting) onCancel() }}>
      <AlertDialogContent className="max-w-sm gap-0 p-5">
        <AlertDialogHeader className="gap-2 text-left">
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
            <AlertDialogTitle className="text-base font-semibold text-slate-900">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-slate-600">{message}</AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <AlertDialogFooter className="mt-4 flex-row gap-2 sm:justify-stretch">
          <Button variant="outline" onClick={onCancel} disabled={submitting} className="flex-1">
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'destructive' : 'default'} onClick={handleConfirm} disabled={submitting} className="flex-1">
            {submitting ? 'Memproses…' : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
