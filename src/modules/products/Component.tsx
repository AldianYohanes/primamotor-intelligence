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
import type { ProductListParams, ProductStatusFilter, ProductSortableColumn } from "./data/params";
import type { ProductListResponse } from "./data/response";
import type { ProductViewModel } from "./mappers/mappers";

const PAGE_SIZE = 20;

const emptyForm = {
  name: "",
  part_number: "",
  category: "",
  unit: "pcs",
  min_threshold: 0,
  // ROP (reorder point) params dipakai Monitoring Agent — string kosong =
  // belum diisi (dikirim undefined saat submit), sama pola dengan warranty_days.
  lead_time_days: "",
  safety_stock: "",
  unit_cost: 0,
  selling_price: 0,
  preferred_supplier_id: "",
  aliases: "",
  // Migration 0028 — string kosong = tidak diisi (dikirim sebagai undefined
  // saat submit), bukan "0 hari". Dipakai fitur klaim garansi POS.
  warranty_days: "",
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
      lead_time_days:
        raw.lead_time_days != null ? String(raw.lead_time_days) : "",
      safety_stock: raw.safety_stock != null ? String(raw.safety_stock) : "",
      unit_cost: raw.unit_cost,
      selling_price: raw.selling_price,
      preferred_supplier_id: raw.preferred_supplier_id ?? "",
      // §15.4 — sekarang PATCH mendukung replace aliases, jadi form edit
      // diisi dari alias yang sudah ada (bukan dikosongkan lagi).
      aliases: product.aliases.join(", "),
      warranty_days: raw.warranty_days != null ? String(raw.warranty_days) : "",
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

  async function toggleActiveOptimistic(id: string, nextActive: boolean) {
    // §15.4 — optimistic update: toggle Aktif/Nonaktif ini yang paling sering
    // diklik berulang kali (tiap kali admin bersihkan katalog), jadi paling
    // kerasa nunggu round-trip-nya kalau tidak optimistic. `updatingId` tetap
    // dipertahankan sebagai indikator kecil "masih proses di background"
    // (§11: loading state eksplisit), TAPI baris tabel sudah berubah status
    // duluan tanpa nunggu network — bukan pengganti indikator, cuma tidak lagi
    // memblokir tampilan.
    setUpdatingId(id);
    try {
      await refresh(
        async (current) => {
          const { product: updated } = await setProductActive(id, nextActive);
          if (!current) return current;
          return {
            ...current,
            data: current.data.map((p) => (p.id === id ? updated : p)),
          };
        },
        {
          // Non-null assertion sengaja: fungsi ini cuma bisa terpanggil dari
          // baris tabel yang sudah RENDER (artinya `products`/cache SWR-nya
          // sudah pasti terisi) — kalau `current` betulan undefined di sini,
          // itu justru kondisi yang seharusnya mustahil, bukan kasus normal
          // yang perlu ditangani diam-diam.
          optimisticData: (current: ProductListResponse | undefined) => ({
            ...current!,
            data: current!.data.map((p) =>
              p.id === id ? { ...p, is_active: nextActive } : p,
            ),
          }),
          // Hasil network call di atas SUDAH jadi data final yang di-`return`
          // ke cache — revalidate ulang cuma buang-buang satu request lagi
          // tanpa manfaat tambahan.
          revalidate: false,
          rollbackOnError: true,
        },
      );
    } catch (err) {
      // rollbackOnError sudah otomatis balikin cache ke kondisi semula —
      // di sini cuma perlu kasih tahu, bukan manual revert apapun.
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleActive(product: ProductViewModel) {
    // Menonaktifkan itu destruktif (produk hilang dari daftar aktif & tidak
    // bisa dipilih staf lewat chat/transaksi) — minta konfirmasi eksplisit.
    // Mengaktifkan kembali tidak destruktif, langsung jalan seperti semula.
    if (product.isActive) {
      requestDeactivate(product);
      return;
    }
    await toggleActiveOptimistic(product.id, true);
  }

  async function confirmDeactivate() {
    if (!deactivatingProduct) return;
    const id = deactivatingProduct.id;
    setDeactivatingProduct(null); // tutup dialog dulu — jangan nunggu network buat UI ini responsif
    await toggleActiveOptimistic(id, false);
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
          lead_time_days:
            form.lead_time_days === "" ? undefined : Number(form.lead_time_days),
          safety_stock:
            form.safety_stock === "" ? undefined : Number(form.safety_stock),
          unit_cost: form.unit_cost,
          selling_price: form.selling_price,
          preferred_supplier_id: form.preferred_supplier_id || undefined,
          warranty_days: form.warranty_days === "" ? undefined : Number(form.warranty_days),
          // §15.4 — selalu dikirim (bukan `|| undefined`) supaya mengosongkan
          // field ini di form lalu submit benar-benar menghapus semua alias,
          // bukan diam-diam diabaikan (array kosong ≠ undefined di PATCH).
          aliases: form.aliases
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
        });
      } else {
        await createProduct({
          ...form,
          min_threshold: form.min_threshold,
          lead_time_days:
            form.lead_time_days === "" ? undefined : Number(form.lead_time_days),
          safety_stock:
            form.safety_stock === "" ? undefined : Number(form.safety_stock),
          preferred_supplier_id: form.preferred_supplier_id || undefined,
          warranty_days: form.warranty_days === "" ? undefined : Number(form.warranty_days),
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
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Produk</h1>
        <button
          onClick={() => (formMode ? closeForm() : openCreateForm())}
          className="btn btn-primary"
        >
          {formMode ? "Tutup" : "+ Tambah Produk"}
        </button>
      </div>

      {formMode && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 card p-4 sm:grid-cols-2"
        >
          <p className="text-sm font-semibold text-slate-900 sm:col-span-2">
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
            label="Lead Time (hari, opsional)"
            type="number"
            value={form.lead_time_days}
            onChange={(v) => setForm({ ...form, lead_time_days: v })}
            placeholder="Dipakai Monitoring Agent utk hitung reorder point"
          />
          <Input
            label="Safety Stock (opsional)"
            type="number"
            value={form.safety_stock}
            onChange={(v) => setForm({ ...form, safety_stock: v })}
            placeholder="Dipakai Monitoring Agent utk hitung reorder point"
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
          <Input
            label="Garansi (hari, opsional)"
            type="number"
            value={form.warranty_days}
            onChange={(v) => setForm({ ...form, warranty_days: v })}
          />
          <div>
            <label className="field-label">
              Supplier Utama
            </label>
            <select
              value={form.preferred_supplier_id}
              onChange={(e) =>
                setForm({ ...form, preferred_supplier_id: e.target.value })
              }
              className="field-input mt-1"
            >
              <option value="">— Tidak ditentukan —</option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Alias (pisah koma)"
            value={form.aliases}
            onChange={(v) => setForm({ ...form, aliases: v })}
            placeholder="karbu, karburator"
          />
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
                  : "Simpan Produk"}
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

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari produk…"
          className="field-input w-full max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ProductStatusFilter);
            setPage(1);
          }}
          className="field-input"
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
      <label className="field-label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="field-input mt-1"
      />
    </div>
  );
}
