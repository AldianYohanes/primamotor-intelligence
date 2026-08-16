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
          ? 'badge-red'
          : vm.isActive
            ? 'badge-emerald'
            : 'badge-slate'
        return <span className={`badge ${cls}`}>{vm.statusLabel}</span>
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
            className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-50 disabled:hover:text-brand-600"
          >
            {row.original.isActive ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
          <button onClick={() => options.onResetPin(row.original)} className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-700">
            Reset PIN
          </button>
        </div>
      ),
    },
  ]
}
