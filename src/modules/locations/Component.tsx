"use client";

import { useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/ui/DataTable";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { useGetLocations } from "./hooks/use-get-locations";
import { usePostLocation } from "./hooks/use-post-location";
import {
  usePatchLocation,
  useDeleteLocation,
} from "./hooks/use-patch-location";
import { createLocationColumns } from "./data/coldef";
import type { LocationListParams } from "./data/params";
import type { LocationType } from "./data/response";
import type { LocationViewModel } from "./mappers/mappers";

const PAGE_SIZE = 20;

const emptyForm = { name: "", type: "toko" as LocationType, address: "" };
type FormState = typeof emptyForm;

/**
 * modules/locations/Component.tsx — CRUD lokasi (toko/gudang) per tenant.
 * Beda dari products: tidak ada soft-delete (locations tidak punya kolom
 * is_active) — Hapus di sini betulan DELETE fisik, tapi backend akan menolak
 * kalau lokasi sudah punya histori transaksi (lihat catatan di route [id]).
 */
export function LocationsModule() {
  const [page, setPage] = useState(1);
  const [sorting] = useState<SortingState>([]);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LocationViewModel | null>(null);

  const params: LocationListParams = useMemo(
    () => ({ page, pageSize: PAGE_SIZE }),
    [page],
  );
  const { locations, pageInfo, isLoading, error, refresh } =
    useGetLocations(params);
  const { createLocation, isCreating } = usePostLocation();
  const { updateFields, isUpdating } = usePatchLocation();
  const { remove } = useDeleteLocation();

  function openCreateForm() {
    setForm(emptyForm);
    setFormError(null);
    setEditingId(null);
    setFormMode("create");
  }

  function openEditForm(loc: LocationViewModel) {
    setForm({
      name: loc.raw.name,
      type: loc.raw.type,
      address: loc.raw.address ?? "",
    });
    setFormError(null);
    setEditingId(loc.id);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        address: form.address || undefined,
      };
      if (formMode === "edit" && editingId) {
        await updateFields(editingId, payload);
      } else {
        await createLocation(payload);
        setPage(1);
      }
      closeForm();
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Gagal menyimpan lokasi",
      );
    }
  }

  function requestDelete(loc: LocationViewModel) {
    setDeleteError(null);
    setDeleting(loc);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await remove(deleting.id);
      setDeleting(null);
      await refresh();
    } catch (err) {
      // Ditampilkan di ConfirmDialog lewat throw (ConfirmDialog nangkap & render sendiri) —
      // tapi kita juga simpan biar tetap tampil kalau dialog ditutup lalu dibuka lagi.
      setDeleteError(
        err instanceof Error ? err.message : "Gagal menghapus lokasi",
      );
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo(
    () =>
      createLocationColumns({
        onEdit: openEditForm,
        onDelete: requestDelete,
        isBusyId: busyId,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Lokasi</h1>
        <button
          onClick={() => (formMode ? closeForm() : openCreateForm())}
          className="btn btn-primary"
        >
          {formMode ? "Tutup" : "+ Tambah Lokasi"}
        </button>
      </div>

      {formMode && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 card p-4 sm:grid-cols-2"
        >
          <p className="text-sm font-semibold text-slate-900 sm:col-span-2">
            {formMode === "edit" ? "Edit Lokasi" : "Lokasi Baru"}
          </p>
          <div>
            <label className="field-label">
              Nama Lokasi
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="field-input mt-1"
            />
          </div>
          <div>
            <label className="field-label">Jenis</label>
            <select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as LocationType })
              }
              className="field-input mt-1"
            >
              <option value="toko">Toko</option>
              <option value="gudang">Gudang</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Alamat</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="field-input mt-1"
            />
          </div>
          {formError && (
            <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button
              disabled={isCreating || isUpdating}
              className="btn btn-primary"
            >
              {isCreating || isUpdating
                ? "Menyimpan…"
                : formMode === "edit"
                  ? "Simpan Perubahan"
                  : "Simpan Lokasi"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="btn btn-secondary"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600">
          Gagal memuat lokasi: {error.message}
        </p>
      )}
      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

      <DataTable
        columns={columns}
        data={locations}
        sorting={sorting}
        onSortingChange={() => {}}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Belum ada lokasi. Tambah toko atau gudang pertama."
      />

      {deleting && (
        <ConfirmDialog
          title="Hapus Lokasi"
          message={`"${deleting.name}" akan dihapus permanen. Kalau lokasi ini sudah punya histori transaksi stok, penghapusan akan ditolak sistem.`}
          confirmLabel="Hapus"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
