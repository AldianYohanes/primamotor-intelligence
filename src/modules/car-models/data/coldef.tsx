'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { CarModelViewModel } from '../mappers/mappers'

export function createCarModelColumns(): ColumnDef<CarModelViewModel>[] {
  return [
    { accessorKey: 'brand', header: 'Merek', enableSorting: false },
    { accessorKey: 'name', header: 'Model', enableSorting: false, cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.name}</span> },
    { accessorKey: 'eraGroup', header: 'Generasi', enableSorting: false },
    { accessorKey: 'yearRange', header: 'Tahun', enableSorting: false },
  ]
}
