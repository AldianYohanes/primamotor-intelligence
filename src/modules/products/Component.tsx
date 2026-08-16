"use client";

import { useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/ui/DataTable";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { useGetProducts } from "./hooks/use-get-products";
import { usePostProduct } from "./hooks/use-post-product";
import { usePatchProduct } from "./hooks/use-patch-product";
import { useGetSupplierOptions } from "./hooks/use-get-supplier-options";
import { createProductColumns } from "./data/coldef";
import type {
  ProductListParams,
  ProductStatusFilter,
  ProductSortableColumn,
} from "./data/params";
import type { ProductViewModel } from "./mappers/mappers";

const PAGE_SIZE = 20;

const emptyForm = {
  name: "",
  part_number: "",
  category: "",
  unit: "pcs",
  min_threshold: 0,
  unit_cost: 0,
  selling_price: 0,
  preferred_supplier_id: "",
  aliases: "",
};

type FormState = typeof emptyForm;

/**
 * modules/products/Component.tsx — satu-satunya file yang tahu bagaimana
 * semua potongan modul ini (data/, hooks/, mappers/, services/, utils/)
 * dirangkai jadi UI. app/(admin)/admin/products/page.tsx cuma memanggil ini
 * di dalam <Suspense>, tidak ada logika di page.tsx.
 */
export function ProductsModule() {
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ProductStatusFilter>("active");

  // formMode: 'create' | 'edit' | null — satu form dipakai untuk keduanya,
  // dibedakan lewat editingId (null = mode tambah baru).
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Produk yang sedang dikonfirmasi untuk dinonaktifkan (soft-delete) — dialog
  // konfirmasi non-PIN, beda dari PinConfirmDialog yang khusus transaksi stok.
  const [deactivatingProduct, setDeactivatingProduct] =
    useState<ProductViewModel | null>(null);

  // sorting.id (accessorKey, bisa camelCase) belum tentu sama dengan nama kolom
  // backend — coldef.tsx menaruh pemetaannya di column.meta.sortId. Di sini kita
  // hanya tahu sorting[0].id (string), jadi mapping sortId->backend disederhanakan
  // lewat konstanta yang sinkron dengan meta di coldef.tsx.
  const SORT_ID_TO_BACKEND: Record<string, ProductSortableColumn> = {
    name: "name",
    partNumber: "part_number",
    category: "category",
    sellingPriceFormatted: "selling_price",
    minThreshold: "min_threshold",
  };

  const params: ProductListParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      q: search || undefined,
      sortBy: sorting[0] ? SORT_ID_TO_BACKEND[sorting[0].id] : undefined,
      sortDir: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
      status: statusFilter,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, search, sorting, statusFilter],
  );

  const { products, pageInfo, isLoading, error, refresh } =
    useGetProducts(params);
  const { createProduct, isCreating } = usePostProduct();
  const { setProductActive, updateFields, isUpdating } = usePatchProduct();
  const { supplierOptions } = useGetSupplierOptions();

  function openCreateForm() {
    setForm(emptyForm);
    setFormError(null);
    setEditingId(null);
    setFormMode("create");
  }

  function openEditForm(product: ProductViewModel) {
    const raw = product.raw;
    setForm({
      name: raw.name,
      part_number: raw.part_number ?? "",
      category: raw.category ?? "",
      unit: raw.unit,
      min_threshold: raw.min_threshold ?? 0,
      unit_cost: raw.unit_cost,
      selling_price: raw.selling_price,
      preferred_supplier_id: raw.preferred_supplier_id ?? "",
      aliases: "", // PATCH tidak mendukung update aliases (lihat route [id]) — sengaja dikosongkan, bukan bug
    });
    setFormError(null);
    setEditingId(product.id);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function requestDeactivate(product: ProductViewModel) {
    setDeactivatingProduct(product);
  }

  async function handleToggleActive(product: ProductViewModel) {
    // Menonaktifkan itu destruktif (produk hilang dari daftar aktif & tidak
    // bisa dipilih staf lewat chat/transaksi) — minta konfirmasi eksplisit.
    // Mengaktifkan kembali tidak destruktif, langsung jalan seperti semula.
    if (product.isActive) {
      requestDeactivate(product);
      return;
    }
    setUpdatingId(product.id);
    try {
      await setProductActive(product.id, true);
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function confirmDeactivate() {
    if (!deactivatingProduct) return;
    setUpdatingId(deactivatingProduct.id);
    try {
      await setProductActive(deactivatingProduct.id, false);
      await refresh();
      setDeactivatingProduct(null);
    } finally {
      setUpdatingId(null);
    }
  }

  const columns = useMemo(
    () =>
      createProductColumns({
        onToggleActive: handleToggleActive,
        onEdit: openEditForm,
        isUpdatingId: updatingId,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updatingId],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      if (formMode === "edit" && editingId) {
        await updateFields(editingId, {
          name: form.name,
          part_number: form.part_number || undefined,
          category: form.category || undefined,
          unit: form.unit,
          min_threshold: form.min_threshold,
          unit_cost: form.unit_cost,
          selling_price: form.selling_price,
          preferred_supplier_id: form.preferred_supplier_id || undefined,
        });
      } else {
        await createProduct({
          ...form,
          preferred_supplier_id: form.preferred_supplier_id || undefined,
          aliases: form.aliases
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
        });
        setPage(1);
      }
      closeForm();
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Gagal menyimpan produk",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Produk</h1>
        <button
          onClick={() => (formMode ? closeForm() : openCreateForm())}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          {formMode ? "Tutup" : "+ Tambah Produk"}
        </button>
      </div>

      {formMode && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
        >
          <p className="text-sm font-medium text-slate-700 sm:col-span-2">
            {formMode === "edit" ? "Edit Produk" : "Produk Baru"}
          </p>
          <Input
            label="Nama Produk"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            required
          />
          <Input
            label="Nomor Part"
            value={form.part_number}
            onChange={(v) => setForm({ ...form, part_number: v })}
          />
          <Input
            label="Kategori"
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v })}
          />
          <Input
            label="Satuan"
            value={form.unit}
            onChange={(v) => setForm({ ...form, unit: v })}
          />
          <Input
            label="Ambang Minimum"
            type="number"
            value={String(form.min_threshold)}
            onChange={(v) => setForm({ ...form, min_threshold: Number(v) })}
          />
          <Input
            label="Harga Beli"
            type="number"
            value={String(form.unit_cost)}
            onChange={(v) => setForm({ ...form, unit_cost: Number(v) })}
          />
          <Input
            label="Harga Jual"
            type="number"
            value={String(form.selling_price)}
            onChange={(v) => setForm({ ...form, selling_price: Number(v) })}
          />
          <div>
            <label className="text-xs font-medium text-slate-600">
              Supplier Utama
            </label>
            <select
              value={form.preferred_supplier_id}
              onChange={(e) =>
                setForm({ ...form, preferred_supplier_id: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
            >
              <option value="">— Tidak ditentukan —</option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {formMode === "create" && (
            <Input
              label="Alias (pisah koma)"
              value={form.aliases}
              onChange={(v) => setForm({ ...form, aliases: v })}
              placeholder="karbu, karburator"
            />
          )}
          {formError && (
            <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button
              disabled={isCreating || isUpdating}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isCreating || isUpdating
                ? "Menyimpan…"
                : formMode === "edit"
                  ? "Simpan Perubahan"
                  : "Simpan Produk"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari produk…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ProductStatusFilter);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        >
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
          <option value="all">Semua</option>
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Gagal memuat produk: {error.message}
        </p>
      )}

      <DataTable
        columns={columns}
        data={products}
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next);
          setPage(1);
        }}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Belum ada produk yang cocok dengan filter ini."
      />

      {deactivatingProduct && (
        <ConfirmDialog
          title="Nonaktifkan Produk"
          message={`"${deactivatingProduct.name}" akan disembunyikan dari daftar produk aktif dan tidak bisa dipilih staf lewat chat/transaksi. Histori stok tetap tersimpan. Lanjutkan?`}
          confirmLabel="Nonaktifkan"
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivatingProduct(null)}
        />
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
      />
    </div>
  );
}
