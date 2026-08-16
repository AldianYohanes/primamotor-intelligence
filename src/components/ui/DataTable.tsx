'use client'

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

/**
 * Wrapper tipis di atas TanStack Table (headless — table.getHeaderGroups()/getRowModel()
 * murni data, semua markup <table> tetap kita yang tulis). Server-side sepenuhnya:
 * manualPagination + manualSorting = true, jadi TanStack Table TIDAK mengurutkan atau
 * memotong data sendiri — dia cuma "state manager" untuk sorting/pagination, eksekusi
 * sebenarnya selalu di backend lewat onSortingChange/onPageChange yang memicu refetch.
 *
 * Dipakai oleh modules/products/Component.tsx, dan modul lain nanti (staff, suppliers,
 * dst) begitu dimigrasi ke pola yang sama.
 */
export interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  isLoading?: boolean
  emptyMessage?: string
}

export function DataTable<T>({
  columns,
  data,
  sorting,
  onSortingChange,
  page,
  totalPages,
  onPageChange,
  isLoading,
  emptyMessage = 'Tidak ada data.',
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      onSortingChange(next)
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  })

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.columnDef.enableSorting
                  const sortDir = header.column.getIsSorted()
                  return (
                    <th key={header.id} className="p-3">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 hover:text-slate-700"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' && <ChevronUp size={14} />}
                          {sortDir === 'desc' && <ChevronDown size={14} />}
                          {!sortDir && <ChevronsUpDown size={14} className="opacity-40" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-6 text-center text-sm text-slate-400">
                  Memuat data…
                </td>
              </tr>
            )}
            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-6 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="p-3 text-slate-600">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
          <span>
            Halaman {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || isLoading}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
