"use client";

import { useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/ui/DataTable";
import { useGetOpnameHistory } from "./hooks/use-get-opname-history";
import { useGetOpnameFormOptions } from "./hooks/use-get-opname-form-options";
import { usePostOpname } from "./hooks/use-post-opname";
import { opnameColumns } from "./data/coldef";

const PAGE_SIZE = 20;
const emptyForm = {
  product_id: "",
  location_id: "",
  counted_quantity: "",
  notes: "",
};

export function StockOpnameModule() {
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState<string | null>(null);

  const { products, locations } = useGetOpnameFormOptions();
  const { history, pageInfo, isLoading, refresh } = useGetOpnameHistory({
    page,
    pageSize: PAGE_SIZE,
  });
  const { createOpname, isCreating } = usePostOpname();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    try {
      const res = await createOpname({
        ...form,
        counted_quantity: Number(form.counted_quantity),
      });
      setResult(
        res.opname.discrepancy === 0
          ? "Stok sesuai, tidak ada penyesuaian."
          : `Selisih ${res.opname.discrepancy > 0 ? "+" : ""}${res.opname.discrepancy} tercatat & stok disesuaikan otomatis.`,
      );
      setForm(emptyForm);
      setPage(1);
      await refresh();
    } catch (err) {
      setResult(
        `Gagal: ${err instanceof Error ? err.message : "terjadi kesalahan"}`,
      );
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Stock Opname</h1>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-3 card p-4 sm:grid-cols-2"
      >
        <div>
          <label className="field-label">Produk</label>
          <select
            value={form.product_id}
            onChange={(e) => setForm({ ...form, product_id: e.target.value })}
            required
            className="field-input mt-1"
          >
            <option value="">Pilih produk</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Lokasi</label>
          <select
            value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
            required
            className="field-input mt-1"
          >
            <option value="">Pilih lokasi</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">
            Jumlah Hasil Hitung Fisik
          </label>
          <input
            type="number"
            min={0}
            value={form.counted_quantity}
            onChange={(e) =>
              setForm({ ...form, counted_quantity: e.target.value })
            }
            required
            className="field-input mt-1"
          />
        </div>
        <div>
          <label className="field-label">
            Catatan (opsional)
          </label>
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="field-input mt-1"
          />
        </div>
        {result && (
          <p className="text-sm text-slate-700 sm:col-span-2">{result}</p>
        )}
        <div className="sm:col-span-2">
          <button
            disabled={isCreating}
            className="btn btn-primary"
          >
            {isCreating ? "Menyimpan…" : "Catat Hasil Opname"}
          </button>
        </div>
      </form>

      <div>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">Riwayat</h2>
        <DataTable
          columns={opnameColumns}
          data={history}
          sorting={[] as SortingState}
          onSortingChange={() => {}}
          page={pageInfo?.page ?? 1}
          totalPages={pageInfo?.totalPages ?? 1}
          onPageChange={setPage}
          isLoading={isLoading}
          emptyMessage="Belum ada riwayat opname."
        />
      </div>
    </div>
  );
}
