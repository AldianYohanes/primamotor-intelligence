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
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Staf</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="btn btn-primary"
        >
          {showForm ? "Tutup" : "+ Tambah Staf"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 card p-4 sm:grid-cols-2"
        >
          <div>
            <label className="field-label">
              Nama Lengkap
            </label>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
              className="field-input mt-1"
            />
          </div>
          <div>
            <label className="field-label">
              Username
            </label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              className="field-input mt-1"
            />
          </div>
          <div>
            <label className="field-label">Role</label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as "owner" | "staff" })
              }
              className="field-input mt-1"
            >
              <option value="staff">Staf</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div>
            <label className="field-label">
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
              className="field-input mt-1"
            />
          </div>
          {formError && (
            <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>
          )}
          <div className="sm:col-span-2">
            <button
              disabled={isCreating}
              className="btn btn-primary"
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
