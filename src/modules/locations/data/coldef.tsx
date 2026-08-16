'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { LocationViewModel } from '../mappers/mappers'

export function createLocationColumns(options: {
  onEdit: (loc: LocationViewModel) => void
  onDelete: (loc: LocationViewModel) => void
  isBusyId: string | null
}): ColumnDef<LocationViewModel>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Nama',
      enableSorting: false,
      cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.name}</span>,
    },
    {
      accessorKey: 'typeLabel',
      header: 'Jenis',
      enableSorting: false,
    },
    {
      accessorKey: 'address',
      header: 'Alamat',
      enableSorting: false,
      cell: ({ row }) => <span className="text-slate-600">{row.original.address}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const busy = options.isBusyId === row.original.id
        return (
          <div className="flex items-center gap-3">
            <button onClick={() => options.onEdit(row.original)} disabled={busy} className="text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-50 disabled:hover:text-slate-600">
              Edit
            </button>
            <button onClick={() => options.onDelete(row.original)} disabled={busy} className="text-xs font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-50 disabled:hover:text-red-600">
              {busy ? 'Memproses…' : 'Hapus'}
            </button>
          </div>
        )
      },
    },
  ]
}
