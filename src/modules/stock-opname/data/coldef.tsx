'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { OpnameViewModel } from '../mappers/mappers'

export const opnameColumns: ColumnDef<OpnameViewModel>[] = [
  { accessorKey: 'productName', header: 'Produk' },
  { accessorKey: 'locationName', header: 'Lokasi' },
  { accessorKey: 'systemQuantity', header: 'Sistem' },
  { accessorKey: 'countedQuantity', header: 'Fisik' },
  {
    accessorKey: 'discrepancyLabel',
    header: 'Selisih',
    cell: ({ row }) => {
      const vm = row.original
      const cls = vm.discrepancyTone === 'neutral' ? 'text-slate-400' : vm.discrepancyTone === 'positive' ? 'text-emerald-600' : 'text-red-600'
      return <span className={`font-medium ${cls}`}>{vm.discrepancyLabel}</span>
    },
  },
  { accessorKey: 'dateFormatted', header: 'Tanggal' },
]
