"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, Truck } from "lucide-react";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { usePatchReorderSuggestion } from "@/src/modules/audit-log/hooks/use-patch-reorder-suggestion";
import { formatDateTimeID, reorderStatusBadgeClass, reorderStatusLabel } from "@/src/modules/audit-log/utils/utils";
import type { ReorderStatus, ReorderSuggestionResponse } from "@/src/modules/audit-log/data/reorder-response";
import type { ReorderStatusFilter } from "@/src/modules/audit-log/data/reorder-params";
import { useReorderList } from "./hooks/use-reorder-list";
import { daysOfStockLeft, readSnapshotFacts } from "./utils/snapshot";

const PAGE_SIZE = 20;

type Action = Exclude<ReorderStatus, "pending">;

export function ReorderSuggestionsModule() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ReorderStatusFilter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<ReorderSuggestionResponse | null>(null);

  const { items, pageInfo, isLoading, error, refresh } = useReorderList({ page, pageSize: PAGE_SIZE, status });
  const { updateStatus } = usePatchReorderSuggestion();

  async function apply(item: ReorderSuggestionResponse, next: Action) {
    setBusyId(item.id);
    setActionError(null);
    try {
      await updateStatus(item.id, next);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal memperbarui saran");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Saran Belanja Ulang</h1>
        <p className="text-sm text-slate-500">
          Barang yang hampir habis menurut Monitoring Agent, lengkap dengan usulan jumlah belinya.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ReorderStatusFilter);
            setPage(1);
          }}
          aria-label="Filter status"
          className="field-input"
        >
          <option value="pending">Belum ditindaklanjuti</option>
          <option value="acknowledged">Sudah dilihat</option>
          <option value="ordered">Sudah dipesan</option>
          <option value="dismissed">Diabaikan</option>
          <option value="all">Semua</option>
        </select>
        <Link href="/admin/audit-log" className="text-sm font-medium text-brand-600 hover:underline">
          Riwayat lengkap
        </Link>
      </div>

      {(error || actionError) && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{actionError ?? `Gagal memuat saran: ${error?.message}`}</span>
        </div>
      )}

      <div className="space-y-3">
        {isLoading && items.length === 0 && <p className="text-sm text-slate-400">Memuat saran…</p>}
        {!isLoading && items.length === 0 && !error && (
          <div className="card p-4 text-sm text-slate-400">
            {status === "pending" ? "Tidak ada barang yang perlu dibeli ulang saat ini." : "Tidak ada saran untuk filter ini."}
          </div>
        )}
        {items.map((item) => (
          <SuggestionCard
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onAction={(next) => (next === "dismissed" ? setDismissing(item) : apply(item, next))}
          />
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

      {dismissing && (
        <ConfirmDialog
          title="Abaikan saran belanja"
          message={`Saran beli ulang "${dismissing.products?.name ?? "barang ini"}" (+${dismissing.suggested_quantity} unit) akan ditandai diabaikan. Masih bisa dilihat lewat filter "Diabaikan". Lanjutkan?`}
          confirmLabel="Abaikan"
          onConfirm={async () => {
            await apply(dismissing, "dismissed");
            setDismissing(null);
          }}
          onCancel={() => setDismissing(null)}
        />
      )}
    </div>
  );
}

function SuggestionCard({
  item,
  busy,
  onAction,
}: {
  item: ReorderSuggestionResponse;
  busy: boolean;
  onAction: (next: Action) => void;
}) {
  const facts = readSnapshotFacts(item.trend_snapshot);
  const daysLeft = daysOfStockLeft(facts);
  const canAct = item.status === "pending" || item.status === "acknowledged";

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{item.products?.name ?? "(produk tidak ditemukan)"}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <Truck size={12} className="shrink-0" />
            {item.suppliers?.name ?? "Supplier belum ditentukan"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-slate-900">+{item.suggested_quantity}</p>
          <p className="text-[11px] text-slate-400">usulan beli</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {facts.stockAtSuggestion != null && <span>Stok saat itu: {facts.stockAtSuggestion}</span>}
        {facts.reorderPoint != null && <span>Titik pesan: {facts.reorderPoint}</span>}
        {daysLeft != null && <span>Perkiraan habis: ±{daysLeft} hari</span>}
      </div>
      {item.reason && <p className="text-xs text-slate-400">{item.reason}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="text-xs text-slate-400">
          <span className={`badge ${reorderStatusBadgeClass(item.status)} mr-2`}>{reorderStatusLabel(item.status)}</span>
          {formatDateTimeID(item.created_at)}
          {item.acknowledged_by_name && ` · oleh ${item.acknowledged_by_name}`}
        </div>
        {canAct && (
          <div className="flex flex-wrap items-center gap-2">
            {item.status === "pending" && (
              <button
                type="button"
                onClick={() => onAction("acknowledged")}
                disabled={busy}
                className="btn btn-secondary !py-1 !text-xs"
              >
                Tandai dilihat
              </button>
            )}
            <button type="button" onClick={() => onAction("ordered")} disabled={busy} className="btn btn-primary !py-1 !text-xs">
              {busy ? "Memproses…" : "Sudah dipesan"}
            </button>
            <button
              type="button"
              onClick={() => onAction("dismissed")}
              disabled={busy}
              className="btn btn-secondary !py-1 !text-xs"
            >
              Abaikan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
