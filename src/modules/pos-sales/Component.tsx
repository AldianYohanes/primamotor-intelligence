"use client";

import { useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { X, ShieldCheck, AlertCircle, RotateCcw } from "lucide-react";
import { DataTable } from "@/src/components/ui/DataTable";
import { useGetSales } from "./hooks/use-get-sales";
import { useGetSaleDetail } from "./hooks/use-get-sale-detail";
import { usePostVoidSale } from "./hooks/use-post-void-sale";
import { usePostWarrantyClaim } from "./hooks/use-post-warranty-claim";
import { createSaleColumns } from "./data/coldef";
import type { SaleListParams, SaleStatusFilter, SaleSortableColumn } from "./data/params";
import type { SaleViewModel, SaleItemViewModel } from "./mappers/mappers";

const PAGE_SIZE = 20;

interface Props {
  /** Kalau staf bukan admin/owner, tombol void di dialog detail disembunyikan
   * — role sesungguhnya tetap ditegakkan server-side (§12), ini murni UX. */
  canVoid: boolean;
}

/**
 * modules/pos-sales/Component.tsx — riwayat penjualan POS untuk admin/owner
 * meninjau & membatalkan nota kalau perlu. Beda dari pos-terminal (layar kasir
 * checkout) — modul ini murni read + void, tidak ada alur keranjang di sini.
 */
export function PosSalesModule({ canVoid }: Props) {
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAtFormatted", desc: true }]);
  const [statusFilter, setStatusFilter] = useState<SaleStatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("");

  const [selectedSale, setSelectedSale] = useState<SaleViewModel | null>(null);
  const [showVoidForm, setShowVoidForm] = useState(false);

  const SORT_ID_TO_BACKEND: Record<string, SaleSortableColumn> = {
    createdAtFormatted: "created_at",
    totalAmountFormatted: "total_amount",
  };

  const params: SaleListParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter,
      paymentMethod: paymentFilter || undefined,
      sortBy: sorting[0] ? SORT_ID_TO_BACKEND[sorting[0].id] : undefined,
      sortDir: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, statusFilter, paymentFilter, sorting],
  );

  const { sales, pageInfo, isLoading, error, refresh } = useGetSales(params);

  const columns = useMemo(
    () =>
      createSaleColumns({
        onViewDetail: (sale) => {
          setSelectedSale(sale);
          setShowVoidForm(false);
        },
      }),
    [],
  );

  function closeDetail() {
    setSelectedSale(null);
    setShowVoidForm(false);
  }

  async function handleVoided() {
    setShowVoidForm(false);
    closeDetail();
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Riwayat Penjualan</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as SaleStatusFilter);
            setPage(1);
          }}
          className="field-input w-auto"
        >
          <option value="all">Semua Status</option>
          <option value="completed">Selesai</option>
          <option value="voided">Dibatalkan</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => {
            setPaymentFilter(e.target.value);
            setPage(1);
          }}
          className="field-input w-auto"
        >
          <option value="">Semua Metode Bayar</option>
          <option value="cash">Tunai</option>
          <option value="transfer">Transfer Bank</option>
          <option value="qris">QRIS</option>
          <option value="card">Kartu Debit/Kredit</option>
          <option value="split">Split (Gabungan)</option>
          <option value="piutang">Piutang</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">Gagal memuat riwayat penjualan: {error.message}</p>}

      <DataTable
        columns={columns}
        data={sales}
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next);
          setPage(1);
        }}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Belum ada penjualan yang cocok dengan filter ini."
      />

      {selectedSale && (
        <SaleDetailDialog
          saleId={selectedSale.id}
          canVoid={canVoid && !selectedSale.isVoided}
          showVoidForm={showVoidForm}
          onRequestVoid={() => setShowVoidForm(true)}
          onCancelVoidForm={() => setShowVoidForm(false)}
          onVoided={handleVoided}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

function SaleDetailDialog({
  saleId,
  canVoid,
  showVoidForm,
  onRequestVoid,
  onCancelVoidForm,
  onVoided,
  onClose,
}: {
  saleId: string;
  canVoid: boolean;
  showVoidForm: boolean;
  onRequestVoid: () => void;
  onCancelVoidForm: () => void;
  onVoided: () => void;
  onClose: () => void;
}) {
  const { detail, isLoading, error, refresh } = useGetSaleDetail(saleId);
  const { voidSale, isVoiding } = usePostVoidSale(saleId);

  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);

  const [claimingItemId, setClaimingItemId] = useState<string | null>(null);

  async function handleSubmitVoid(e: React.FormEvent) {
    e.preventDefault();
    setVoidError(null);
    try {
      await voidSale({ pin, reason });
      onVoided();
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : "Gagal membatalkan nota");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-[1px] sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-popover">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Detail Nota</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {isLoading && <p className="py-6 text-center text-sm text-slate-400">Memuat…</p>}
        {error && <p className="text-sm text-red-600">Gagal memuat detail: {error.message}</p>}

        {detail && !showVoidForm && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-slate-600">
              <span>No. Nota</span>
              <span className="text-right font-mono text-xs text-slate-900">{detail.saleNumber}</span>
              <span>Waktu</span>
              <span className="text-right text-slate-900">{detail.createdAtFormatted}</span>
              <span>Lokasi</span>
              <span className="text-right text-slate-900">{detail.locationName}</span>
              <span>Kasir</span>
              <span className="text-right text-slate-900">{detail.staffName}</span>
              <span>Pelanggan</span>
              <span className="text-right text-slate-900">{detail.customerName}</span>
              <span>Metode Bayar</span>
              <span className="text-right text-slate-900">{detail.paymentMethodLabel}</span>
            </div>

            <div className="divide-y divide-dashed divide-slate-200 border-y border-slate-200 py-2">
              {detail.items.map((item) => (
                <ItemRow key={item.id} item={item} saleId={saleId} isClaimFormOpen={claimingItemId === item.id} onOpenClaim={() => setClaimingItemId(item.id)} onCloseClaim={() => setClaimingItemId(null)} onClaimed={refresh} />
              ))}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{detail.subtotalFormatted}</span>
              </div>
              {detail.discountAmountFormatted !== 'Rp0' && (
                <div className="flex justify-between text-slate-600">
                  <span>Diskon</span>
                  <span>- {detail.discountAmountFormatted}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-slate-900">
                <span>Total</span>
                <span>{detail.totalAmountFormatted}</span>
              </div>
            </div>

            {detail.isVoided && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Dibatalkan {detail.voidedAtFormatted} — alasan: {detail.voidReason ?? "-"}
              </div>
            )}

            {canVoid && (
              <button onClick={onRequestVoid} className="btn btn-danger w-full py-2">
                Batalkan Nota Ini
              </button>
            )}
          </div>
        )}

        {detail && showVoidForm && (
          <form onSubmit={handleSubmitVoid} className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <ShieldCheck size={15} className="shrink-0" />
              <span>Membatalkan nota akan mengembalikan stok {detail.items.length} produk. Masukkan PIN untuk konfirmasi.</span>
            </div>

            <div>
              <label className="field-label">Alasan Pembatalan</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder="Salah input jumlah, pelanggan batal, dsb."
                className="field-input mt-1"
              />
            </div>

            <div>
              <label className="field-label">PIN Konfirmasi</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                maxLength={12}
                placeholder="Masukkan PIN"
                className="field-input mt-1 text-center tracking-widest"
              />
            </div>

            {voidError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{voidError}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={onCancelVoidForm} disabled={isVoiding} className="btn btn-secondary flex-1 py-2">
                Batal
              </button>
              <button type="submit" disabled={isVoiding || pin.length < 6} className="btn btn-danger flex-1 py-2">
                {isVoiding ? "Memproses…" : "Konfirmasi Void"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  saleId,
  isClaimFormOpen,
  onOpenClaim,
  onCloseClaim,
  onClaimed,
}: {
  item: SaleItemViewModel;
  saleId: string;
  isClaimFormOpen: boolean;
  onOpenClaim: () => void;
  onCloseClaim: () => void;
  onClaimed: () => void;
}) {
  const { claimWarranty, isClaiming } = usePostWarrantyClaim(saleId, item.id);
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<"replaced" | "refunded" | "repaired">("replaced");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await claimWarranty({ reason, resolution });
      onClaimed();
      onCloseClaim();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses klaim garansi");
    }
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-900">{item.productName}</p>
          <p className="text-xs text-slate-500">
            {item.quantity} {item.unit} × {item.unitPriceFormatted}
          </p>
          {item.isAlreadyClaimed && (
            <p className="text-xs text-emerald-700">Garansi diklaim — {item.claimResolutionLabel}</p>
          )}
          {!item.isAlreadyClaimed && item.warrantyUntilFormatted && (
            <p className={item.isWarrantyExpired ? "text-xs text-slate-400" : "text-xs text-slate-500"}>
              Garansi s/d {item.warrantyUntilFormatted}
              {item.isWarrantyExpired && " (habis)"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{item.subtotalFormatted}</span>
          {item.canClaimWarranty && !isClaimFormOpen && (
            <button onClick={onOpenClaim} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              <RotateCcw size={12} /> Klaim
            </button>
          )}
        </div>
      </div>

      {isClaimFormOpen && (
        <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="Alasan klaim (barang cacat, dsb.)"
            className="field-input w-full text-xs"
          />
          <select value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)} className="field-input w-full text-xs">
            <option value="replaced">Diganti unit baru (stok dikembalikan)</option>
            <option value="refunded">Dikembalikan uang (stok dikembalikan)</option>
            <option value="repaired">Diperbaiki (stok tidak berubah)</option>
          </select>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onCloseClaim} disabled={isClaiming} className="btn btn-secondary flex-1 py-1 text-xs">
              Batal
            </button>
            <button type="submit" disabled={isClaiming} className="btn btn-primary flex-1 py-1 text-xs">
              {isClaiming ? "Memproses…" : "Simpan"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
