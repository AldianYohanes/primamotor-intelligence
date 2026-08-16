'use client'

import { useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { useGetImports } from './hooks/use-get-imports'
import { useGetImportDetail } from './hooks/use-get-import-detail'
import { usePostUploadReceipt } from './hooks/use-post-upload-receipt'
import { usePatchImportItem } from './hooks/use-patch-import-item'
import { usePostCommitImport } from './hooks/use-post-commit-import'
import type { ImportItemViewModel } from './mappers/mappers'

const PAGE_SIZE = 20

export function ReceiptImportsModule() {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)

  const { imports, pageInfo, refresh: refreshImports } = useGetImports({ page, pageSize: PAGE_SIZE })
  const { items, refresh: refreshDetail } = useGetImportDetail(selected)
  const { upload, isUploading } = usePostUploadReceipt()
  const { updateItem } = usePatchImportItem(selected ?? '')
  const { commit, isCommitting } = usePostCommitImport()

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const result = await upload(file)
      await refreshImports()
      setSelected(result.import_id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal memproses bon')
    }
  }

  async function handleUpdateItem(itemId: string, patch: Parameters<typeof updateItem>[1]) {
    await updateItem(itemId, patch)
    await refreshDetail()
  }

  async function handleCommit() {
    if (!selected) return
    const result = await commit(selected)
    alert(`${result.committed_count} item berhasil dicatat sebagai stok masuk.${result.failed.length ? ` ${result.failed.length} gagal.` : ''}`)
    await refreshImports()
    await refreshDetail()
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <h1 className="mb-3 text-xl font-semibold tracking-tight text-slate-900">Review Bon</h1>

        <label className="mb-4 flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40">
          <UploadCloud size={20} strokeWidth={1.5} className="text-slate-400" />
          {isUploading ? 'Memproses foto bon…' : 'Tap untuk unggah foto bon'}
          <input type="file" accept="image/*" onChange={handleUpload} disabled={isUploading} className="hidden" />
        </label>

        <div className="divide-y divide-slate-100 card">
          {imports.map((imp) => (
            <button
              key={imp.id}
              onClick={() => setSelected(imp.id)}
              className={`block w-full border-l-2 p-3 text-left text-sm transition-colors ${selected === imp.id ? 'border-brand-600 bg-brand-50' : 'border-transparent hover:bg-slate-50'}`}
            >
              <p className="font-medium text-slate-900">{imp.createdAtFormatted}</p>
              <p className="text-xs text-slate-500">{imp.statusLabel}</p>
            </button>
          ))}
        </div>

        {pageInfo && pageInfo.totalPages > 1 && (
          <div className="mt-3 flex justify-center gap-2 text-xs">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pageInfo.totalPages}
              className="rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        {!selected && <p className="text-sm text-slate-400">Pilih atau unggah bon untuk mulai review.</p>}
        {selected && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Item Terdeteksi</h2>
              <button
                onClick={handleCommit}
                disabled={isCommitting}
                className="btn btn-primary"
              >
                {isCommitting ? 'Memproses…' : 'Commit ke Stok'}
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item: ImportItemViewModel) => (
                <div key={item.id} className="card p-3">
                  <p className="text-xs text-slate-400">{item.rawLineText}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {item.productName ?? '⚠️ Tidak terdeteksi — perlu dicocokkan manual'}
                    </span>
                    <input
                      type="number"
                      defaultValue={item.suggestedQuantity}
                      onBlur={(e) => handleUpdateItem(item.id, { suggested_quantity: Number(e.target.value) })}
                      className="field-input w-20 !py-1"
                    />
                    <select
                      value={item.status}
                      onChange={(e) => handleUpdateItem(item.id, { status: e.target.value as ImportItemViewModel['status'] })}
                      className="field-input !py-1 !text-xs"
                    >
                      <option value="unmatched">Belum cocok</option>
                      <option value="matched">Cocok (belum dikonfirmasi)</option>
                      <option value="confirmed">✓ Konfirmasi</option>
                      <option value="rejected">✕ Tolak baris ini</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
