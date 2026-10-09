'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Pencil } from 'lucide-react'
import type { StockLevelLocation, StockLevelLocationColumn, StockLevelRow } from './response'

export interface EditTarget {
  product: StockLevelRow
  cell: StockLevelLocation
}

export function createStockLevelColumns(
  locations: StockLevelLocationColumn[],
  onEdit: (target: EditTarget) => void,
): ColumnDef<StockLevelRow>[] {
  const locationColumns: ColumnDef<StockLevelRow>[] = locations.map((loc) => ({
    id: `loc-${loc.id}`,
    header: loc.name,
    cell: ({ row }) => {
      const cell = row.original.locations.find((c) => c.location_id === loc.id)
      if (!cell) return null
      return (
        <div className="flex items-center gap-2">
          <div className="min-w-[3rem]">
            <span className="font-medium tabular-nums text-slate-900">{cell.available_quantity}</span>
            {cell.reserved_quantity > 0 && (
              <span className="block text-[11px] leading-tight text-slate-400">
                +{cell.reserved_quantity} ditahan
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onEdit({ product: row.original, cell })}
            aria-label={`Ubah stok ${row.original.name} di ${loc.name}`}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil size={14} />
          </button>
        </div>
      )
    },
  }))

  return [
    {
      id: 'product',
      header: 'Produk',
      cell: ({ row }) => (
        <div className="min-w-[10rem]">
          <p className="font-medium text-slate-900">{row.original.name}</p>
          {row.original.part_number && (
            <p className="text-xs text-slate-400">{row.original.part_number}</p>
          )}
        </div>
      ),
    },
    ...locationColumns,
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold tabular-nums text-slate-900">
            {row.original.totals.available_quantity}
          </span>
          {row.original.is_low && (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              Menipis
            </span>
          )}
        </div>
      ),
    },
  ]
}
