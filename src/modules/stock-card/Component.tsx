"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Bot, ChevronLeft, ChevronRight } from "lucide-react";
import { useGetStockCard } from "./hooks/use-get-stock-card";
import { TRANSACTION_TYPE_LABELS } from "./mappers/mappers";
import type { StockCardRow } from "./data/response";
import { Select } from "@/src/components/ui/select";

const PAGE_SIZE = 20;

function formatDateTimeID(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export function StockCardModule({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { product, locations, summary, rows, pageInfo, isLoading, error } = useGetStockCard({
    productId,
    page,
    pageSize: PAGE_SIZE,
    locationId: locationId || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const unit = product?.unit ?? "";

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/stock"
          className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
        >
          <ArrowLeft size={14} />
          Stok per Lokasi
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Kartu Stok{product ? `: ${product.name}` : ""}
        </h1>
        {product?.part_number && <p className="text-sm text-slate-500">{product.part_number}</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Select
          value={locationId}
          onValueChange={(value) => {
            setLocationId(value);
            setPage(1);
          }}
          aria-label="Filter lokasi"
          className="field-input"
        >
          <option value="">Semua lokasi</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <label className="text-xs text-slate-500">
          Dari
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="field-input mt-0.5 block"
          />
        </label>
        <label className="text-xs text-slate-500">
          Sampai
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="field-input mt-0.5 block"
          />
        </label>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setPage(1);
            }}
            className="btn btn-secondary !py-1.5 !text-xs"
          >
            Hapus periode
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>Gagal memuat kartu stok: {error.message}</span>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Saldo awal" value={summary.opening_balance} unit={unit} />
          <SummaryCard label="Total masuk" value={summary.total_in} unit={unit} tone="in" />
          <SummaryCard label="Total keluar" value={summary.total_out} unit={unit} tone="out" />
          <SummaryCard label="Saldo akhir" value={summary.closing_balance} unit={unit} strong />
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {isLoading && rows.length === 0 && <p className="p-4 text-sm text-slate-400">Memuat riwayat…</p>}
        {!isLoading && rows.length === 0 && !error && (
          <p className="p-4 text-sm text-slate-400">Belum ada transaksi untuk filter ini.</p>
        )}
        {rows.map((row) => (
          <MovementRow key={row.id} row={row} unit={unit} showLocation={!locationId} />
        ))}
      </div>

      {pageInfo && pageInfo.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Halaman {pageInfo.page} / {pageInfo.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageInfo.page <= 1}
              className="btn btn-secondary !px-2 !py-1.5"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageInfo.totalPages, p + 1))}
              disabled={pageInfo.page >= pageInfo.totalPages}
              className="btn btn-secondary !px-2 !py-1.5"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  tone,
  strong,
}: {
  label: string;
  value: number;
  unit: string;
  tone?: "in" | "out";
  strong?: boolean;
}) {
  const color = tone === "in" ? "text-emerald-700" : tone === "out" ? "text-red-600" : "text-slate-900";
  return (
    <div className="card p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 tabular-nums ${strong ? "text-xl font-semibold" : "text-lg font-medium"} ${color}`}>
        {value}
        <span className="ml-1 text-xs font-normal text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

function MovementRow({ row, unit, showLocation }: { row: StockCardRow; unit: string; showLocation: boolean }) {
  const isIn = row.quantity_in > 0;
  const source = row.via_agent ? "Chat agent" : row.staff_name;
  return (
    <div className="flex items-start justify-between gap-3 p-3 sm:p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          {TRANSACTION_TYPE_LABELS[row.transaction_type]}
          {showLocation && <span className="font-normal text-slate-500"> · {row.location_name}</span>}
        </p>
        <p className="text-xs text-slate-500">{formatDateTimeID(row.created_at)}</p>
        {(source || row.notes) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-400">
            {row.via_agent && <Bot size={12} className="shrink-0" />}
            {source}
            {source && row.notes && " · "}
            {row.notes && <span className="break-words">{row.notes}</span>}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular-nums ${isIn ? "text-emerald-700" : "text-red-600"}`}>
          {isIn ? `+${row.quantity_in}` : `−${row.quantity_out}`}
        </p>
        <p className="text-xs tabular-nums text-slate-500">
          Saldo {row.balance} {unit}
        </p>
      </div>
    </div>
  );
}
