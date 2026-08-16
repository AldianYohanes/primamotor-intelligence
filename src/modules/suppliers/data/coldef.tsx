'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { SupplierViewModel } from '../mappers/mappers'

export const supplierColumns: ColumnDef<SupplierViewModel>[] = [
  {
    accessorKey: 'name',
    header: 'Nama Supplier',
    cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.name}</span>,
  },
  { accessorKey: 'contactLine', header: 'Kontak' },
  { accessorKey: 'address', header: 'Alamat' },
]
