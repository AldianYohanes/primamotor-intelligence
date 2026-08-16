"use client";

import { useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/ui/DataTable";
import { useGetSuppliers } from "./hooks/use-get-suppliers";
import { usePostSupplier } from "./hooks/use-post-supplier";
import { supplierColumns } from "./data/coldef";

const PAGE_SIZE = 20;
const emptyForm = { name: "", contact_person: "", phone: "", address: "" };

export function SuppliersModule() {
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const { suppliers, pageInfo, isLoading, error, refresh } = useGetSuppliers({
    page,
    pageSize: PAGE_SIZE,
  });
  const { createSupplier, isCreating } = usePostSupplier();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await createSupplier(form);
      setForm(emptyForm);
      setShowForm(false);
      setPage(1);
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Gagal menyimpan supplier",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Supplier</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Tutup" : "+ Tambah Supplier"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
        >
          {(["name", "contact_person", "phone", "address"] as const).map(
            (key) => (
              <div key={key}>
                <label className="text-xs font-medium capitalize text-slate-600">
                  {key.replace("_", " ")}
                </label>
                <input
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required={key === "name"}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            ),
          )}
          {formError && (
            <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>
          )}
          <div className="sm:col-span-2">
            <button
              disabled={isCreating}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isCreating ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600">
          Gagal memuat supplier: {error.message}
        </p>
      )}

      <DataTable
        columns={supplierColumns}
        data={suppliers}
        sorting={[] as SortingState}
        onSortingChange={() => {}}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Belum ada supplier."
      />
    </div>
  );
}
