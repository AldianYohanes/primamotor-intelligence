'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { SaleViewModel } from '../mappers/mappers'

/**
 * enableSorting di sini murni penanda UI — sort sebenarnya dieksekusi backend
 * (manualSorting: true di Component.tsx). Kolom sortable HARUS ada di
 * SORTABLE_COLUMNS whitelist di app/api/admin/pos/sales/route.ts (§4).
 */
export function createSaleColumns(options: {
  onViewDetail: (sale: SaleViewModel) => void
}): ColumnDef<SaleViewModel>[] {
  return [
    {
      accessorKey: 'saleNumber',
      header: 'No. Nota',
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono text-xs text-slate-500">{row.original.saleNumber}</span>,
    },
    {
      accessorKey: 'createdAtFormatted',
      header: 'Waktu',
      enableSorting: true,
      meta: { sortId: 'created_at' },
    },
    {
      accessorKey: 'customerName',
      header: 'Pelanggan',
      enableSorting: false,
    },
    {
      accessorKey: 'locationName',
      header: 'Lokasi',
      enableSorting: false,
    },
    {
      accessorKey: 'staffName',
      header: 'Kasir',
      enableSorting: false,
    },
    {
      accessorKey: 'paymentMethodLabel',
      header: 'Metode Bayar',
      enableSorting: false,
    },
    {
      accessorKey: 'totalAmountFormatted',
      header: 'Total',
      enableSorting: true,
      meta: { sortId: 'total_amount' },
      cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.totalAmountFormatted}</span>,
    },
    {
      accessorKey: 'statusLabel',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={row.original.isVoided ? 'badge badge-slate' : 'badge badge-emerald'}>
          {row.original.statusLabel}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <button
          onClick={() => options.onViewDetail(row.original)}
          className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          Detail
        </button>
      ),
    },
  ]
}
