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
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.original.statusBadgeClass}`}
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
                className="text-xs text-slate-600 underline disabled:opacity-50"
              >
                Tandai Dilihat
              </button>
            )}
            <button
              onClick={() => options.onAction(row.original, "ordered")}
              disabled={busy}
              className="text-xs text-brand-600 underline disabled:opacity-50"
            >
              Sudah Dipesan
            </button>
            <button
              onClick={() => options.onAction(row.original, "dismissed")}
              disabled={busy}
              className="text-xs text-slate-500 underline disabled:opacity-50"
            >
              {busy ? "Memproses…" : "Abaikan"}
            </button>
          </div>
        );
      },
    },
  ];
}
