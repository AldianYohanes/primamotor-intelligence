'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { ProductViewModel } from '../mappers/mappers'

/**
 * ColumnDef TanStack Table. `enableSorting` di sini murni penanda UI (tampilkan
 * ikon sort & bikin header bisa diklik) — urutan SORT SEBENARNYA dieksekusi di
 * backend (manualSorting: true di Component.tsx), bukan oleh TanStack Table
 * sendiri. Kolom yang enableSorting-nya true HARUS ada di SORTABLE_COLUMNS
 * whitelist di app/api/admin/products/route.ts, kalau tidak sort diam-diam
 * di-ignore backend (fallback ke 'name').
 */
export function createProductColumns(options: {
  onToggleActive: (product: ProductViewModel) => void
  onEdit: (product: ProductViewModel) => void
  isUpdatingId: string | null
}): ColumnDef<ProductViewModel>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Nama Produk',
      enableSorting: true,
      meta: { sortId: 'name' },
      cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.name}</span>,
    },
    {
      accessorKey: 'partNumber',
      header: 'No. Part',
      enableSorting: true,
      meta: { sortId: 'part_number' },
    },
    {
      accessorKey: 'category',
      header: 'Kategori',
      enableSorting: true,
      meta: { sortId: 'category' },
    },
    {
      accessorKey: 'supplierName',
      header: 'Supplier',
      enableSorting: false,
    },
    {
      accessorKey: 'sellingPriceFormatted',
      header: 'Harga Jual',
      enableSorting: true,
      meta: { sortId: 'selling_price' },
    },
    {
      accessorKey: 'minThreshold',
      header: 'Ambang Min.',
      enableSorting: true,
      meta: { sortId: 'min_threshold' },
    },
    {
      accessorKey: 'statusLabel',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <span
          className={
            row.original.isActive
              ? 'badge badge-emerald'
              : 'badge badge-slate'
          }
        >
          {row.original.statusLabel}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <button
            onClick={() => options.onEdit(row.original)}
            disabled={options.isUpdatingId === row.original.id}
            className="text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-50 disabled:hover:text-slate-600"
          >
            Edit
          </button>
          <button
            onClick={() => options.onToggleActive(row.original)}
            disabled={options.isUpdatingId === row.original.id}
            className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-50 disabled:hover:text-brand-600"
          >
            {options.isUpdatingId === row.original.id ? 'Memproses…' : row.original.isActive ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </div>
      ),
    },
  ]
}
