"use client";

import { useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/ui/DataTable";
import { useGetStaff } from "./hooks/use-get-staff";
import { usePostStaff } from "./hooks/use-post-staff";
import { usePatchStaff, useResetStaffPin } from "./hooks/use-patch-staff";
import { createStaffColumns } from "./data/coldef";
import type { StaffViewModel } from "./mappers/mappers";

const PAGE_SIZE = 20;
const emptyForm: {
  username: string;
  full_name: string;
  role: "staff" | "owner";
  pin: string;
} = {
  username: "",
  full_name: "",
  role: "staff",
  pin: "",
};

export function StaffModule() {
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { staff, pageInfo, isLoading, error, refresh } = useGetStaff({
    page,
    pageSize: PAGE_SIZE,
  });
  const { createStaff, isCreating } = usePostStaff();
  const { setStaffActive } = usePatchStaff();
  const { resetPin } = useResetStaffPin();

  async function handleToggleActive(s: StaffViewModel) {
    setUpdatingId(s.id);
    try {
      await setStaffActive(s.id, !s.isActive);
      await refresh();
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleResetPin(s: StaffViewModel) {
    const newPin = prompt(`PIN baru untuk ${s.fullName} (min. 6 digit):`);
    if (!newPin) return;
    await resetPin(s.id, newPin);
    await refresh();
  }

  const columns = useMemo(
    () =>
      createStaffColumns({
        onToggleActive: handleToggleActive,
        onResetPin: handleResetPin,
        isUpdatingId: updatingId,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updatingId],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await createStaff(form);
      setForm(emptyForm);
      setShowForm(false);
      setPage(1);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal membuat akun");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Staf</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Tutup" : "+ Tambah Staf"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
        >
          <div>
            <label className="text-xs font-medium text-slate-600">
              Nama Lengkap
            </label>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              Username
            </label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Role</label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as "owner" | "staff" })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="staff">Staf</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              PIN Awal
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={(e) =>
                setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })
              }
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {formError && (
            <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>
          )}
          <div className="sm:col-span-2">
            <button
              disabled={isCreating}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isCreating ? "Menyimpan…" : "Buat Akun"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600">
          Gagal memuat staf: {error.message}
        </p>
      )}

      <DataTable
        columns={columns}
        data={staff}
        sorting={[] as SortingState}
        onSortingChange={() => {}}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Belum ada staf."
      />
    </div>
  );
}
