'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { AuditLogViewModel } from '../mappers/mappers'

/**
 * Semua kolom enableSorting: false — riwayat ini sengaja hanya diurutkan
 * created_at desc dari backend (route.ts), tidak ada UI sort interaktif untuk
 * sekarang (beda dari products/staff yang punya SORTABLE_COLUMNS whitelist).
 */
export function createAuditLogColumns(): ColumnDef<AuditLogViewModel>[] {
  return [
    {
      accessorKey: 'createdAtFormatted',
      header: 'Waktu',
      enableSorting: false,
      cell: ({ row }) => <span className="whitespace-nowrap text-slate-500">{row.original.createdAtFormatted}</span>,
    },
    {
      accessorKey: 'toolLabel',
      header: 'Aksi',
      enableSorting: false,
      cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.toolLabel}</span>,
    },
    {
      id: 'detail',
      header: 'Detail',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-slate-900">
            {row.original.productName}
            {row.original.quantity !== null ? ` — ${row.original.quantity} unit` : ''}
          </p>
          <p className="text-xs text-slate-500">{row.original.locationDetail}</p>
        </div>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Alasan',
      enableSorting: false,
      cell: ({ row }) => <span className="text-slate-600">{row.original.reason}</span>,
    },
    {
      accessorKey: 'statusLabel',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={`badge ${row.original.statusBadgeClass}`}>{row.original.statusLabel}</span>
      ),
    },
    {
      id: 'confirmedBy',
      header: 'Dikonfirmasi Oleh',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-slate-700">{row.original.confirmedByName}</p>
          {row.original.confirmedAtFormatted !== '-' && <p className="text-xs text-slate-400">{row.original.confirmedAtFormatted}</p>}
        </div>
      ),
    },
  ]
}
