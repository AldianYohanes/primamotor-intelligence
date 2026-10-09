"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/ui/DataTable";
import { useGetStockLevels } from "./hooks/use-get-stock-levels";
import { createStockLevelColumns, type EditTarget } from "./data/coldef";
import { AdjustStockDialog } from "./AdjustStockDialog";

const PAGE_SIZE = 20;
const NO_SORT: SortingState = [];

export function StockLevelsModule() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Debounce pencarian supaya tidak refetch di setiap ketikan.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const { rows, locations, columns: shownLocations, pageInfo, isLoading, error, refresh } =
    useGetStockLevels({
      page,
      pageSize: PAGE_SIZE,
      q: search || undefined,
      locationId: locationId || undefined,
      lowOnly,
    });

  const columns = useMemo(
    () => createStockLevelColumns(shownLocations, setEditTarget),
    [shownLocations],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Stok per Lokasi</h1>
        <Link href="/admin/stock-opname" className="text-sm font-medium text-brand-600 hover:underline">
          Lihat riwayat penyesuaian
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari nama atau nomor part…"
          aria-label="Cari produk"
          className="field-input w-full sm:max-w-xs"
        />
        <select
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
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
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Hanya stok menipis
        </label>
      </div>

      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>Gagal memuat stok: {error.message}</span>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        sorting={NO_SORT}
        onSortingChange={() => {}}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage={
          lowOnly
            ? "Tidak ada produk dengan stok menipis."
            : "Belum ada produk yang cocok dengan filter ini."
        }
      />

      {editTarget && (
        <AdjustStockDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async (message) => {
            setEditTarget(null);
            setNotice(message);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
