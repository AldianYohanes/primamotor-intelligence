'use client'

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'

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
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.columnDef.enableSorting
                  const sortDir = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className="group flex items-center gap-1 hover:text-slate-700"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' && <ChevronUp size={13} className="text-brand-600" />}
                          {sortDir === 'desc' && <ChevronDown size={13} className="text-brand-600" />}
                          {!sortDir && (
                            <ChevronsUpDown size={13} className="text-slate-300 group-hover:text-slate-400" />
                          )}
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
          <tbody className="divide-y divide-slate-100">
            {isLoading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <TableSkeletonRows columns={columns.length} />
                </td>
              </tr>
            )}
            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Inbox size={22} strokeWidth={1.5} />
                    <p className="text-sm">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50/70">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
          <span>
            Halaman <span className="font-medium text-slate-700">{page}</span> dari {totalPages}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || isLoading}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={14} />
              Sebelumnya
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Berikutnya
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TableSkeletonRows({ columns }: { columns: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 5 }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3.5">
          {Array.from({ length: Math.min(columns, 5) }).map((_, c) => (
            <div
              key={c}
              className="h-3 flex-1 animate-pulse rounded bg-slate-100"
              style={{ maxWidth: c === 0 ? '40%' : '18%' }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
