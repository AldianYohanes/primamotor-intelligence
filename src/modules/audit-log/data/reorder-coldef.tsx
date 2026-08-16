"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ReorderSuggestionViewModel } from "../mappers/reorder-mappers";
import type { ReorderStatus } from "./reorder-response";

export function createReorderSuggestionColumns(options: {
  onAction: (
    suggestion: ReorderSuggestionViewModel,
    status: Exclude<ReorderStatus, "pending">,
  ) => void;
  isUpdatingId: string | null;
}): ColumnDef<ReorderSuggestionViewModel>[] {
  return [
    {
      accessorKey: "createdAtFormatted",
      header: "Waktu",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-slate-500">
          {row.original.createdAtFormatted}
        </span>
      ),
    },
    {
      accessorKey: "productName",
      header: "Produk",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-900">
            {row.original.productName}
          </p>
          <p className="text-xs text-slate-500">
            +{row.original.suggestedQuantity} unit disarankan
          </p>
        </div>
      ),
    },
    {
      accessorKey: "supplierName",
      header: "Supplier Disarankan",
      enableSorting: false,
    },
    {
      accessorKey: "reason",
      header: "Alasan",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-slate-600">{row.original.reason}</span>
      ),
    },
    {
      accessorKey: "statusLabel",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <span
            className={`badge ${row.original.statusBadgeClass}`}
          >
            {row.original.statusLabel}
          </span>
          {row.original.acknowledgedByName !== "-" && (
            <p className="mt-1 text-xs text-slate-400">
              oleh {row.original.acknowledgedByName}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        if (!row.original.canAct) return null;
        const busy = options.isUpdatingId === row.original.id;
        return (
          <div className="flex flex-wrap items-center gap-2">
            {row.original.status === "pending" && (
              <button
                onClick={() => options.onAction(row.original, "acknowledged")}
                disabled={busy}
                className="text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-50 disabled:hover:text-slate-600"
              >
                Tandai Dilihat
              </button>
            )}
            <button
              onClick={() => options.onAction(row.original, "ordered")}
              disabled={busy}
              className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-50 disabled:hover:text-brand-600"
            >
              Sudah Dipesan
            </button>
            <button
              onClick={() => options.onAction(row.original, "dismissed")}
              disabled={busy}
              className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-50 disabled:hover:text-slate-500"
            >
              {busy ? "Memproses…" : "Abaikan"}
            </button>
          </div>
        );
      },
    },
  ];
}
