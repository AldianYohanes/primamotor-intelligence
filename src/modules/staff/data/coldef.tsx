'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { StaffViewModel } from '../mappers/mappers'

export function createStaffColumns(options: {
  onToggleActive: (staff: StaffViewModel) => void
  onResetPin: (staff: StaffViewModel) => void
  isUpdatingId: string | null
}): ColumnDef<StaffViewModel>[] {
  return [
    {
      accessorKey: 'fullName',
      header: 'Nama',
      cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.fullName}</span>,
    },
    { accessorKey: 'username', header: 'Username' },
    { accessorKey: 'roleLabel', header: 'Role' },
    {
      accessorKey: 'statusLabel',
      header: 'Status',
      cell: ({ row }) => {
        const vm = row.original
        const cls = vm.isLocked
          ? 'bg-red-100 text-red-700'
          : vm.isActive
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-slate-100 text-slate-500'
        return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{vm.statusLabel}</span>
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-3">
          <button
            onClick={() => options.onToggleActive(row.original)}
            disabled={options.isUpdatingId === row.original.id}
            className="text-xs text-brand-600 underline disabled:opacity-50"
          >
            {row.original.isActive ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
          <button onClick={() => options.onResetPin(row.original)} className="text-xs text-brand-600 underline">
            Reset PIN
          </button>
        </div>
      ),
    },
  ]
}
