"use client";

import { useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/ui/DataTable";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { useGetAuditLog } from "./hooks/use-get-audit-log";
import { createAuditLogColumns } from "./data/coldef";
import { useGetReorderSuggestions } from "./hooks/use-get-reorder-suggestions";
import { usePatchReorderSuggestion } from "./hooks/use-patch-reorder-suggestion";
import { createReorderSuggestionColumns } from "./data/reorder-coldef";
import type {
  AuditLogListParams,
  AuditStatusFilter,
  AuditToolFilter,
} from "./data/params";
import type {
  ReorderSuggestionListParams,
  ReorderStatusFilter,
} from "./data/reorder-params";
import type { ReorderSuggestionViewModel } from "./mappers/reorder-mappers";
import type { ReorderStatus } from "./data/reorder-response";

const PAGE_SIZE = 20;

type Tab = "agent" | "reorder";

/**
 * modules/audit-log/Component.tsx — dua bagian riwayat yang saling terkait tapi
 * berbeda sumber & lifecycle: aksi agent chat (agent_audit_log, konfirmasi PIN)
 * vs saran restock Monitoring Agent (reorder_suggestions, heuristik cron —
 * BUKAN LLM, lihat §6). Digabung satu halaman lewat tab karena user-nya sama
 * (owner/admin meninjau apa yang dilakukan/disarankan sistem), tapi data &
 * hook-nya tetap terpisah, tidak dipaksa satu bentuk.
 */
export function AuditLogModule() {
  const [tab, setTab] = useState<Tab>("agent");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Riwayat Aksi Agent
        </h1>
        <p className="text-sm text-slate-500">
          Aktivitas asisten chat AI dan saran restock dari Monitoring Agent.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabButton active={tab === "agent"} onClick={() => setTab("agent")}>
          Aksi Agent (Chat)
        </TabButton>
        <TabButton active={tab === "reorder"} onClick={() => setTab("reorder")}>
          Saran Restock (Monitoring)
        </TabButton>
      </div>

      {tab === "agent" ? <AgentActionsTab /> : <ReorderSuggestionsTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "border-b-2 border-brand-600 px-3 py-2 text-sm font-medium text-brand-600"
          : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
      }
    >
      {children}
    </button>
  );
}

function AgentActionsTab() {
  const [page, setPage] = useState(1);
  const [sorting] = useState<SortingState>([]);
  const [statusFilter, setStatusFilter] = useState<AuditStatusFilter>("all");
  const [toolFilter, setToolFilter] = useState<AuditToolFilter>("all");

  const params: AuditLogListParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter,
      tool: toolFilter,
    }),
    [page, statusFilter, toolFilter],
  );

  const { logs, pageInfo, isLoading, error } = useGetAuditLog(params);
  const columns = useMemo(() => createAuditLogColumns(), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as AuditStatusFilter);
            setPage(1);
          }}
          className="field-input"
        >
          <option value="all">Semua Status</option>
          <option value="pending">Menunggu PIN</option>
          <option value="executed">Berhasil</option>
          <option value="rejected">Ditolak</option>
          <option value="failed">Gagal</option>
        </select>
        <select
          value={toolFilter}
          onChange={(e) => {
            setToolFilter(e.target.value as AuditToolFilter);
            setPage(1);
          }}
          className="field-input"
        >
          <option value="all">Semua Aksi</option>
          <option value="updateStock">Ubah Stok</option>
          <option value="transferStock">Transfer Stok</option>
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Gagal memuat riwayat: {error.message}
        </p>
      )}

      <DataTable
        columns={columns}
        data={logs}
        sorting={sorting}
        onSortingChange={() => {}}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Belum ada riwayat aksi agent untuk filter ini."
      />
    </div>
  );
}

function ReorderSuggestionsTab() {
  const [page, setPage] = useState(1);
  const [sorting] = useState<SortingState>([]);
  const [statusFilter, setStatusFilter] = useState<ReorderStatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [dismissing, setDismissing] =
    useState<ReorderSuggestionViewModel | null>(null);

  const params: ReorderSuggestionListParams = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, status: statusFilter }),
    [page, statusFilter],
  );

  const { suggestions, pageInfo, isLoading, error, refresh } =
    useGetReorderSuggestions(params);
  const { updateStatus } = usePatchReorderSuggestion();

  async function applyStatus(
    suggestion: ReorderSuggestionViewModel,
    status: Exclude<ReorderStatus, "pending">,
  ) {
    setUpdatingId(suggestion.id);
    try {
      await updateStatus(suggestion.id, status);
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  function handleAction(
    suggestion: ReorderSuggestionViewModel,
    status: Exclude<ReorderStatus, "pending">,
  ) {
    // 'dismissed' itu final (saran hilang dari tindak lanjut) — minta konfirmasi.
    // 'acknowledged'/'ordered' tidak destruktif, langsung jalan.
    if (status === "dismissed") {
      setDismissing(suggestion);
      return;
    }
    applyStatus(suggestion, status);
  }

  async function confirmDismiss() {
    if (!dismissing) return;
    await applyStatus(dismissing, "dismissed");
    setDismissing(null);
  }

  const columns = useMemo(
    () =>
      createReorderSuggestionColumns({
        onAction: handleAction,
        isUpdatingId: updatingId,
      }),
    [updatingId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ReorderStatusFilter);
            setPage(1);
          }}
          className="field-input"
        >
          <option value="all">Semua Status</option>
          <option value="pending">Menunggu Tindak Lanjut</option>
          <option value="acknowledged">Sudah Dilihat</option>
          <option value="ordered">Sudah Dipesan</option>
          <option value="dismissed">Diabaikan</option>
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Gagal memuat saran restock: {error.message}
        </p>
      )}

      <DataTable
        columns={columns}
        data={suggestions}
        sorting={sorting}
        onSortingChange={() => {}}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Belum ada saran restock untuk filter ini."
      />

      {dismissing && (
        <ConfirmDialog
          title="Abaikan Saran Restock"
          message={`Saran restock "${dismissing.productName}" (+${dismissing.suggestedQuantity} unit) akan ditandai diabaikan. Bisa dilihat lagi lewat filter status "Diabaikan". Lanjutkan?`}
          confirmLabel="Abaikan"
          onConfirm={confirmDismiss}
          onCancel={() => setDismissing(null)}
        />
      )}
    </div>
  );
}
