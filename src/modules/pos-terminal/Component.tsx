"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Minus,
  Trash2,
  Search,
  ShoppingCart,
  Printer,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  PlayCircle,
  UserPlus,
  X,
} from "lucide-react";
import { useGetLocationOptions } from "./hooks/use-get-location-options";
import { useGetPosProducts } from "./hooks/use-get-pos-products";
import { usePostCheckout } from "./hooks/use-post-checkout";
import { useGetCustomers } from "./hooks/use-get-customers";
import { useGetOpenShift } from "./hooks/use-get-open-shift";
import { createCustomer, openShift as openShiftApi, fetchShiftReport, closeShift as closeShiftApi, searchPosProducts } from "./services/pos-terminal";
import type { PosProductViewModel } from "./mappers/mappers";
import { mapPosProductResponseToViewModel } from "./mappers/mappers";
import type { PaymentMethod, SaleSummaryPaymentMethod, PaymentLinePayload } from "./data/payload";
import type { CustomerResponse, ShiftResponse, ShiftReportTotalsResponse } from "./data/response";
import { formatRupiah, generateIdempotencyKey } from "./utils/utils";

interface CartLine {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  availableQuantity: number;
}

/**
 * Satu transaksi yang "ditahan" (hold/park) — dipakai kasir saat pelanggan A
 * masih mikir tapi pelanggan B sudah mau bayar duluan. Disimpan MURNI di
 * memori komponen (bukan DB/localStorage) — hilang kalau tab di-refresh.
 * Ini keputusan scope yang disengaja: persist lintas refresh butuh tabel baru
 * + sinkronisasi, dan kasir yang refresh di tengah sesi harusnya jarang.
 * Kalau nanti ternyata sering kejadian, ini titik yang jelas untuk diperluas
 * (mis. tabel `held_carts` per staff_id).
 */
interface HeldCart {
  id: string;
  label: string;
  cart: CartLine[];
  customerName: string;
  discountAmount: number;
  heldAt: string;
}

interface CheckoutSuccess {
  saleId: string;
  saleNumber: string;
  subtotal: number;
  totalAmount: number;
  changeAmount: number;
  paymentSummaryLabel: string;
  amountPaid: number;
  lines: CartLine[];
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Tunai",
  transfer: "Transfer Bank",
  qris: "QRIS",
  card: "Kartu Debit/Kredit",
};

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "transfer", "qris", "card"];

/**
 * modules/pos-terminal/Component.tsx — layar kasir penuh (bukan di dalam
 * AdminShell, lihat app/(pos)/pos/page.tsx). Satu sesi checkout = satu
 * idempotencyKey; key baru dibuat lagi hanya setelah checkout SUKSES, supaya
 * retry akibat jaringan terputus di tengah pembayaran tidak dobel-catat
 * nota & dobel-potong stok (lihat catatan di data/payload.ts & migration 0025).
 */
export function PosTerminalModule({ staffName }: { staffName: string }) {
  const { locationOptions, isLoading: isLoadingLocations } = useGetLocationOptions();
  const [locationId, setLocationId] = useState<string>("");

  useEffect(() => {
    if (!locationId && locationOptions.length > 0) {
      const toko = locationOptions.find((l) => l.type === "toko");
      setLocationId((toko ?? locationOptions[0]).id);
    }
  }, [locationOptions, locationId]);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { products, isLoading: isSearching } = useGetPosProducts(
    locationId ? { location_id: locationId, q: debouncedSearch || undefined, limit: 20 } : null,
  );

  const [cart, setCart] = useState<CartLine[]>([]);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);

  // 'cash'|'transfer'|'qris'|'card' = satu metode; 'split' = pilih manual dari
  // paymentLines; 'piutang' = dibayar nanti oleh pelanggan terdaftar.
  const [paymentMode, setPaymentMode] = useState<SaleSummaryPaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentLines, setPaymentLines] = useState<PaymentLinePayload[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResponse | null>(null);

  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey());
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CheckoutSuccess | null>(null);

  const { checkout, isCheckingOut } = usePostCheckout();
  const { openShift: currentShift, refresh: refreshShift } = useGetOpenShift(locationId || null);
  const [showShiftPanel, setShowShiftPanel] = useState(false);

  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0), [cart]);
  const total = Math.max(subtotal - discountAmount, 0);
  const change = paymentMode === "cash" ? Math.max(amountPaid - total, 0) : 0;
  const splitPaidTotal = paymentLines.reduce((sum, p) => sum + p.amount, 0);
  const splitRemaining = Math.max(total - splitPaidTotal, 0);

  function addToCart(product: PosProductViewModel) {
    if (product.isOutOfStock) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.availableQuantity) return prev; // soft limit — RPC tetap validasi ulang saat checkout
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          unitPrice: product.sellingPrice,
          quantity: 1,
          availableQuantity: product.availableQuantity,
        },
      ];
    });
  }

  /**
   * Barcode scanner umumnya keyboard wedge: ketik cepat lalu kirim Enter,
   * SELURUH string biasanya masuk dalam <50ms — jauh lebih cepat dari debounce
   * 300ms di atas. Kalau Enter mengandalkan `products` dari hook (hasil
   * pencarian yang SUDAH di-debounce), pada saat Enter ditekan hasil itu
   * masih dari pencarian LAMA (atau kosong) — bukan dari string barcode yang
   * baru saja selesai diketik. Makanya di sini pencarian dipanggil ULANG
   * secara langsung (bypass debounce & bypass hook), bukan membaca `products`.
   */
  async function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !locationId) return;
    const rawValue = e.currentTarget.value.trim();
    if (!rawValue) return;
    try {
      const { results } = await searchPosProducts({ location_id: locationId, q: rawValue, limit: 5 });
      if (results.length === 1) {
        addToCart(mapPosProductResponseToViewModel(results[0]));
        setSearchInput("");
        setDebouncedSearch("");
      }
      // >1 atau 0 hasil: biarkan hook pencarian normal yang menampilkan
      // daftar (kasir ketik manual biasanya bukan barcode, ambigu memang
      // wajar tidak auto-tambah).
    } catch {
      // Diam-diam gagal di sini tidak masalah — hook pencarian normal (yang
      // sudah jalan lewat debounce) tetap akan menampilkan hasil/error-nya
      // sendiri ke UI, ini cuma jalur cepat tambahan utk kasus 1 hasil persis.
    }
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(quantity, l.availableQuantity) } : l)),
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function resetPaymentState() {
    setDiscountAmount(0);
    setAmountPaid(0);
    setPaymentLines([]);
    setPaymentMode("cash");
    setCustomerName("");
    setSelectedCustomer(null);
    setCheckoutError(null);
  }

  function resetForNextSale() {
    setCart([]);
    resetPaymentState();
    setIdempotencyKey(generateIdempotencyKey());
    setSuccess(null);
  }

  function holdCurrentCart() {
    if (cart.length === 0) return;
    const label = customerName || `Transaksi ${heldCarts.length + 1}`;
    setHeldCarts((prev) => [
      ...prev,
      { id: idempotencyKey, label, cart, customerName, discountAmount, heldAt: new Date().toLocaleTimeString("id-ID") },
    ]);
    setCart([]);
    resetPaymentState();
    setIdempotencyKey(generateIdempotencyKey());
  }

  function resumeHeldCart(held: HeldCart) {
    if (cart.length > 0) {
      // Kalau ada transaksi aktif yang belum ditahan, tahan dulu supaya tidak hilang.
      holdCurrentCart();
    }
    setCart(held.cart);
    setCustomerName(held.customerName);
    setDiscountAmount(held.discountAmount);
    setIdempotencyKey(held.id);
    setHeldCarts((prev) => prev.filter((h) => h.id !== held.id));
  }

  function addPaymentLine(method: PaymentMethod) {
    setPaymentLines((prev) => {
      if (prev.some((p) => p.method === method)) return prev;
      return [...prev, { method, amount: prev.length === 0 ? total : Math.max(total - splitPaidTotal, 0) }];
    });
  }

  function updatePaymentLineAmount(method: PaymentMethod, amount: number) {
    setPaymentLines((prev) => prev.map((p) => (p.method === method ? { ...p, amount } : p)));
  }

  function removePaymentLine(method: PaymentMethod) {
    setPaymentLines((prev) => prev.filter((p) => p.method !== method));
  }

  async function handleCheckout() {
    setCheckoutError(null);
    if (cart.length === 0) {
      setCheckoutError("Keranjang masih kosong");
      return;
    }
    if (!locationId) {
      setCheckoutError("Pilih lokasi penjualan dulu");
      return;
    }

    let effectivePaymentMethod: SaleSummaryPaymentMethod = paymentMode;
    let payments: PaymentLinePayload[] | undefined;

    if (paymentMode === "piutang") {
      if (!selectedCustomer) {
        setCheckoutError("Pilih pelanggan untuk pembayaran piutang");
        return;
      }
    } else if (paymentMode === "split") {
      if (paymentLines.length < 2) {
        setCheckoutError("Split payment butuh minimal 2 metode — pakai metode tunggal kalau cuma 1");
        return;
      }
      if (splitPaidTotal < total) {
        setCheckoutError(`Total pembayaran split (${formatRupiah(splitPaidTotal)}) kurang dari total nota`);
        return;
      }
      payments = paymentLines;
    } else {
      // metode tunggal cash/transfer/qris/card
      const singleAmount = paymentMode === "cash" ? amountPaid : total;
      if (paymentMode === "cash" && amountPaid < total) {
        setCheckoutError("Jumlah bayar kurang dari total");
        return;
      }
      payments = [{ method: paymentMode as PaymentMethod, amount: singleAmount }];
      effectivePaymentMethod = paymentMode;
    }

    try {
      const result = await checkout({
        location_id: locationId,
        items: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
        payment_method: effectivePaymentMethod,
        payments,
        customer_id: selectedCustomer?.id,
        discount_amount: discountAmount || undefined,
        customer_name: customerName || undefined,
        idempotency_key: idempotencyKey,
      });

      const paymentSummaryLabel =
        paymentMode === "piutang"
          ? `Piutang — ${selectedCustomer?.name}`
          : paymentMode === "split"
            ? paymentLines.map((p) => PAYMENT_LABELS[p.method]).join(" + ")
            : PAYMENT_LABELS[paymentMode as PaymentMethod];

      setSuccess({
        saleId: result.sale_id,
        saleNumber: result.sale_number,
        subtotal: result.subtotal,
        totalAmount: result.total_amount,
        changeAmount: result.change_amount,
        paymentSummaryLabel,
        amountPaid: paymentMode === "piutang" ? 0 : paymentMode === "cash" ? amountPaid : result.total_amount,
        lines: cart,
      });
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Gagal memproses penjualan");
    }
  }

  if (success) {
    return <Receipt success={success} onNewSale={resetForNextSale} />;
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 gap-0 bg-[#f7f8fa] lg:grid-cols-[1fr_400px]">
      {/* Panel kiri: pencarian & katalog produk */}
      <div className="flex min-h-dvh flex-col p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Kasir (POS)</h1>
            <p className="text-xs text-slate-500">Kasir: {staffName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShiftPanel(true)}
              className={
                currentShift
                  ? "flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  : "flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              }
            >
              {currentShift ? "Shift Aktif" : "Buka Shift"}
            </button>
            {heldCarts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {heldCarts.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => resumeHeldCart(h)}
                    className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                    title={`Ditahan ${h.heldAt} — ${h.cart.length} item`}
                  >
                    <PlayCircle size={13} /> {h.label}
                  </button>
                ))}
              </div>
            )}
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={isLoadingLocations}
              className="field-input w-auto"
            >
              {locationOptions.length === 0 && <option value="">Memuat lokasi…</option>}
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.type === "toko" ? "Toko" : "Gudang"})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative mb-4">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Cari nama produk, no. part, atau scan barcode…"
            className="field-input w-full pl-9"
            autoFocus
          />
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {isSearching && products.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-slate-400">Mencari…</p>
          )}
          {!isSearching && products.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-slate-400">
              {debouncedSearch ? "Tidak ada produk yang cocok." : "Ketik atau scan barcode untuk mencari produk."}
            </p>
          )}
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.isOutOfStock}
              className="card flex flex-col items-start gap-1 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
            >
              <span className="line-clamp-2 text-sm font-medium text-slate-900">{p.name}</span>
              <span className="text-xs text-slate-500">{p.partNumber}</span>
              {p.compatibleModelsSummary && (
                <span className="line-clamp-1 text-[11px] text-slate-400" title={p.compatibleModels.join(', ')}>
                  Cocok: {p.compatibleModelsSummary}
                </span>
              )}
              <span className="mt-auto text-sm font-semibold text-brand-700">{p.sellingPriceFormatted}</span>
              <span className={p.isOutOfStock ? "badge badge-slate" : "badge badge-emerald"}>
                {p.isOutOfStock ? "Stok habis" : `Stok: ${p.availableQuantity} ${p.unit}`}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Panel kanan: keranjang & pembayaran */}
      <div className="flex min-h-dvh flex-col border-t border-slate-200 bg-white p-4 sm:p-6 lg:border-l lg:border-t-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShoppingCart size={16} /> Keranjang ({cart.length})
          </h2>
          {cart.length > 0 && (
            <button
              onClick={holdCurrentCart}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <PauseCircle size={14} /> Tahan
            </button>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {cart.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Belum ada item.</p>}
          {cart.map((line) => (
            <div key={line.productId} className="flex items-center gap-2 rounded-md border border-slate-200 p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{line.name}</p>
                <p className="text-xs text-slate-500">
                  {formatRupiah(line.unitPrice)} / {line.unit}
                </p>
              </div>
              <button
                onClick={() => updateQuantity(line.productId, line.quantity - 1)}
                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                aria-label="Kurangi"
              >
                <Minus size={13} />
              </button>
              <span className="w-6 text-center text-sm font-medium text-slate-900">{line.quantity}</span>
              <button
                onClick={() => updateQuantity(line.productId, line.quantity + 1)}
                disabled={line.quantity >= line.availableQuantity}
                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Tambah"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={() => removeFromCart(line.productId)}
                className="rounded-md p-1 text-red-500 hover:bg-red-50"
                aria-label="Hapus"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
          <Input label="Nama Pelanggan (opsional)" value={customerName} onChange={setCustomerName} placeholder="Walk-in" />

          <div>
            <label className="field-label">Diskon Nota (Rp)</label>
            <input
              type="number"
              min={0}
              value={discountAmount || ""}
              onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
              className="field-input mt-1"
            />
          </div>

          <div>
            <label className="field-label">Metode Pembayaran</label>
            <select
              value={paymentMode}
              onChange={(e) => {
                const next = e.target.value as SaleSummaryPaymentMethod;
                setPaymentMode(next);
                setPaymentLines([]);
                if (next !== "piutang") setSelectedCustomer(null);
              }}
              className="field-input mt-1"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABELS[m]}
                </option>
              ))}
              <option value="split">Split (Gabungan Metode)</option>
              <option value="piutang">Piutang (Bayar Nanti)</option>
            </select>
          </div>

          {paymentMode === "cash" && (
            <div>
              <label className="field-label">Jumlah Dibayar (Rp)</label>
              <input
                type="number"
                min={0}
                value={amountPaid || ""}
                onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                className="field-input mt-1"
              />
            </div>
          )}

          {paymentMode === "split" && (
            <SplitPaymentEditor
              lines={paymentLines}
              remaining={splitRemaining}
              onAdd={addPaymentLine}
              onChangeAmount={updatePaymentLineAmount}
              onRemove={removePaymentLine}
            />
          )}

          {paymentMode === "piutang" && (
            <CustomerPicker selected={selectedCustomer} onSelect={setSelectedCustomer} orderTotal={total} />
          )}

          <div className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">
            <Row label="Subtotal" value={formatRupiah(subtotal)} />
            {discountAmount > 0 && <Row label="Diskon" value={`- ${formatRupiah(discountAmount)}`} />}
            <Row label="Total" value={formatRupiah(total)} bold />
            {paymentMode === "cash" && <Row label="Kembalian" value={formatRupiah(change)} />}
            {paymentMode === "split" && <Row label="Sisa Belum Dibayar" value={formatRupiah(splitRemaining)} />}
          </div>

          {checkoutError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{checkoutError}</span>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={isCheckingOut || cart.length === 0}
            className="btn btn-primary w-full py-2.5 text-base"
          >
            {isCheckingOut
              ? "Memproses…"
              : paymentMode === "piutang"
                ? `Catat Piutang ${formatRupiah(total)}`
                : `Bayar ${formatRupiah(total)}`}
          </button>
        </div>
      </div>

      {showShiftPanel && (
        <ShiftPanel
          locationId={locationId}
          currentShift={currentShift}
          onClose={() => setShowShiftPanel(false)}
          onChanged={refreshShift}
        />
      )}
    </div>
  );
}

function SplitPaymentEditor({
  lines,
  remaining,
  onAdd,
  onChangeAmount,
  onRemove,
}: {
  lines: PaymentLinePayload[];
  remaining: number;
  onAdd: (method: PaymentMethod) => void;
  onChangeAmount: (method: PaymentMethod, amount: number) => void;
  onRemove: (method: PaymentMethod) => void;
}) {
  const availableMethods = PAYMENT_METHODS.filter((m) => !lines.some((l) => l.method === m));
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-500">
        Split Payment — tidak ada kembalian untuk kombinasi metode (lihat catatan di migration 0027)
      </p>
      {lines.map((line) => (
        <div key={line.method} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-sm text-slate-700">{PAYMENT_LABELS[line.method]}</span>
          <input
            type="number"
            min={0}
            value={line.amount || ""}
            onChange={(e) => onChangeAmount(line.method, Number(e.target.value) || 0)}
            className="field-input flex-1"
          />
          <button onClick={() => onRemove(line.method)} className="rounded-md p-1 text-red-500 hover:bg-red-50" aria-label="Hapus metode">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {availableMethods.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {availableMethods.map((m) => (
            <button
              key={m}
              onClick={() => onAdd(m)}
              className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
            >
              <Plus size={11} className="mr-1 inline" /> {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>
      )}
      {remaining > 0 && lines.length > 0 && (
        <p className="text-xs text-amber-700">Sisa {formatRupiah(remaining)} belum dialokasikan ke metode manapun.</p>
      )}
    </div>
  );
}

function CustomerPicker({
  selected,
  onSelect,
  orderTotal,
}: {
  selected: CustomerResponse | null;
  onSelect: (c: CustomerResponse | null) => void;
  orderTotal: number;
}) {
  const [query, setQuery] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { customers, isLoading } = useGetCustomers(query);

  if (selected) {
    const availableCredit = selected.credit_limit - selected.balance;
    const overLimit = orderTotal > availableCredit;
    return (
      <div className="space-y-1.5 rounded-md border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">{selected.name}</p>
            <p className="text-xs text-slate-500">
              Sisa limit: {formatRupiah(availableCredit)} (piutang berjalan {formatRupiah(selected.balance)})
            </p>
          </div>
          <button onClick={() => onSelect(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
            Ganti
          </button>
        </div>
        {overLimit && <p className="text-xs text-red-600">Total nota melebihi sisa limit piutang pelanggan ini.</p>}
      </div>
    );
  }

  if (showQuickAdd) {
    return (
      <QuickAddCustomer
        onCreated={(c) => {
          onSelect(c);
          setShowQuickAdd(false);
        }}
        onCancel={() => setShowQuickAdd(false)}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari pelanggan langganan…"
          className="field-input w-full pl-8 text-sm"
        />
      </div>
      <div className="max-h-32 space-y-1 overflow-y-auto">
        {isLoading && <p className="text-xs text-slate-400">Mencari…</p>}
        {!isLoading && customers.length === 0 && <p className="text-xs text-slate-400">Tidak ada pelanggan yang cocok.</p>}
        {customers.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="flex w-full items-center justify-between rounded-md border border-slate-200 px-2.5 py-1.5 text-left text-sm hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="text-slate-900">{c.name}</span>
            <span className="text-xs text-slate-500">Limit {formatRupiah(c.credit_limit - c.balance)}</span>
          </button>
        ))}
      </div>
      <button onClick={() => setShowQuickAdd(true)} className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
        <UserPlus size={13} /> Tambah pelanggan baru
      </button>
    </div>
  );
}

function QuickAddCustomer({ onCreated, onCancel }: { onCreated: (c: CustomerResponse) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Nama wajib diisi");
      return;
    }
    setIsSaving(true);
    try {
      const { customer } = await createCustomer({ name: name.trim(), phone: phone.trim() || undefined, credit_limit: creditLimit });
      onCreated(customer);
    } catch (err) {
      // Kemungkinan besar 403 (bukan admin/owner) — POST /customers dibatasi §12.
      setError(err instanceof Error ? err.message : "Gagal menambah pelanggan");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <Input label="Nama Pelanggan" value={name} onChange={setName} placeholder="Bengkel Jaya Motor" />
      <Input label="No. Telepon (opsional)" value={phone} onChange={setPhone} />
      <div>
        <label className="field-label">Limit Piutang (Rp)</label>
        <input
          type="number"
          min={0}
          value={creditLimit || ""}
          onChange={(e) => setCreditLimit(Number(e.target.value) || 0)}
          className="field-input mt-1"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} disabled={isSaving} className="btn btn-secondary flex-1 py-1.5 text-xs">
          Batal
        </button>
        <button onClick={handleSave} disabled={isSaving} className="btn btn-primary flex-1 py-1.5 text-xs">
          {isSaving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

function ShiftPanel({
  locationId,
  currentShift,
  onClose,
  onChanged,
}: {
  locationId: string;
  currentShift: ShiftResponse | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [openingCash, setOpeningCash] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [report, setReport] = useState<ShiftReportTotalsResponse | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [closeNotes, setCloseNotes] = useState("");
  const [closedResult, setClosedResult] = useState<{ totals: ShiftReportTotalsResponse; variance: number } | null>(null);

  async function loadReport(shiftId: string) {
    setIsLoadingReport(true);
    try {
      const { totals } = await fetchShiftReport(shiftId);
      setReport(totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat laporan shift");
    } finally {
      setIsLoadingReport(false);
    }
  }

  useEffect(() => {
    if (currentShift) loadReport(currentShift.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShift?.id]);

  async function handleOpenShift() {
    setError(null);
    setIsSubmitting(true);
    try {
      await openShiftApi({ location_id: locationId, opening_cash: openingCash });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuka shift");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCloseShift(e: React.FormEvent) {
    e.preventDefault();
    if (!currentShift) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await closeShiftApi(currentShift.id, { closing_cash: closingCash, notes: closeNotes || undefined });
      setClosedResult({ totals: result.totals, variance: result.shift.cash_variance ?? 0 });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menutup shift");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-popover">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {closedResult ? "Shift Ditutup (Z Report)" : currentShift ? "Shift Aktif" : "Buka Shift"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {closedResult && (
          <div className="space-y-2 text-sm">
            <ShiftTotalsSummary totals={closedResult.totals} />
            <div className="rounded-md bg-slate-50 p-3">
              <Row label="Selisih Kas" value={formatRupiah(closedResult.variance)} bold />
              <p className="mt-1 text-xs text-slate-500">
                {closedResult.variance === 0
                  ? "Kas pas, tidak ada selisih."
                  : closedResult.variance > 0
                    ? "Kas fisik LEBIH dari perhitungan sistem."
                    : "Kas fisik KURANG dari perhitungan sistem."}
              </p>
            </div>
            <button onClick={onClose} className="btn btn-primary w-full py-2">
              Selesai
            </button>
          </div>
        )}

        {!closedResult && !currentShift && (
          <div className="space-y-3">
            <div>
              <label className="field-label">Kas Awal (Rp)</label>
              <input
                type="number"
                min={0}
                value={openingCash || ""}
                onChange={(e) => setOpeningCash(Number(e.target.value) || 0)}
                className="field-input mt-1"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button onClick={handleOpenShift} disabled={isSubmitting} className="btn btn-primary w-full py-2">
              {isSubmitting ? "Membuka…" : "Buka Shift"}
            </button>
          </div>
        )}

        {!closedResult && currentShift && !showCloseForm && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">Dibuka {new Date(currentShift.opened_at).toLocaleString("id-ID")}</p>
            {isLoadingReport && <p className="text-xs text-slate-400">Memuat laporan…</p>}
            {report && <ShiftTotalsSummary totals={report} />}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button onClick={() => setShowCloseForm(true)} className="btn btn-danger w-full py-2">
              Tutup Shift (Z Report)
            </button>
          </div>
        )}

        {!closedResult && currentShift && showCloseForm && (
          <form onSubmit={handleCloseShift} className="space-y-3">
            {report && (
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <Row label="Kas Diharapkan" value={formatRupiah(report.expectedCash)} bold />
              </div>
            )}
            <div>
              <label className="field-label">Kas Fisik Dihitung (Rp)</label>
              <input
                type="number"
                min={0}
                value={closingCash || ""}
                onChange={(e) => setClosingCash(Number(e.target.value) || 0)}
                className="field-input mt-1"
              />
            </div>
            <div>
              <label className="field-label">Catatan (opsional)</label>
              <input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} className="field-input mt-1" />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCloseForm(false)} disabled={isSubmitting} className="btn btn-secondary flex-1 py-2">
                Batal
              </button>
              <button type="submit" disabled={isSubmitting} className="btn btn-danger flex-1 py-2">
                {isSubmitting ? "Memproses…" : "Konfirmasi Tutup"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ShiftTotalsSummary({ totals }: { totals: ShiftReportTotalsResponse }) {
  return (
    <div className="space-y-1 rounded-md bg-slate-50 p-3">
      <Row label="Jumlah Nota" value={String(totals.salesCount)} />
      <Row label="Total Penjualan" value={formatRupiah(totals.grossRevenue)} bold />
      <Row label="— Tunai" value={formatRupiah(totals.cashTotal)} />
      <Row label="— Transfer" value={formatRupiah(totals.transferTotal)} />
      <Row label="— QRIS" value={formatRupiah(totals.qrisTotal)} />
      <Row label="— Kartu" value={formatRupiah(totals.cardTotal)} />
      <Row label="— Piutang" value={formatRupiah(totals.piutangTotal)} />
      {totals.voidCount > 0 && <Row label="Nota Dibatalkan" value={`${totals.voidCount} (${formatRupiah(totals.voidTotalAmount)})`} />}
    </div>
  );
}

const PAPER_WIDTHS = { "58mm": 58, "80mm": 80 } as const;
type PaperWidth = keyof typeof PAPER_WIDTHS;

/**
 * Cetak thermal via CSS `@media print` biasa — bukan raw ESC/POS lewat
 * WebUSB/WebSerial. Pendekatan ini cocok untuk printer thermal yang
 * disetup sebagai printer biasa di OS (paling umum di toko kecil: driver
 * generik/vendor terima print job standar). Kalau nanti butuh kontrol
 * printer langsung (buka laci kas otomatis dsb.), itu perlu implementasi
 * terpisah dengan printer fisik untuk ditest — tidak bisa divalidasi di
 * sandbox pengembangan ini.
 */
function Receipt({ success, onNewSale }: { success: CheckoutSuccess; onNewSale: () => void }) {
  const [paperWidth, setPaperWidth] = useState<PaperWidth>("80mm");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f8fa] p-4">
      <style>{`
        @media print {
          @page { size: ${PAPER_WIDTHS[paperWidth]}mm auto; margin: 0; }
          body * { visibility: hidden; }
          #pos-receipt, #pos-receipt * { visibility: visible; }
          #pos-receipt {
            position: absolute; left: 0; top: 0;
            width: ${PAPER_WIDTHS[paperWidth]}mm;
            padding: 2mm;
            font-family: ui-monospace, monospace;
            font-size: 10px;
            line-height: 1.35;
          }
        }
      `}</style>
      <div id="pos-receipt" className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-popover print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <CheckCircle2 size={32} className="text-emerald-600 print:hidden" />
          <h2 className="text-base font-semibold text-slate-900">Penjualan Berhasil</h2>
          <p className="text-xs text-slate-500">Nota #{success.saleNumber}</p>
        </div>

        <div className="space-y-1 divide-y divide-dashed divide-slate-200 text-sm">
          {success.lines.map((l) => (
            <div key={l.productId} className="flex justify-between py-1.5">
              <span className="text-slate-600">
                {l.name} × {l.quantity}
              </span>
              <span className="text-slate-900">{formatRupiah(l.unitPrice * l.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <Row label="Subtotal" value={formatRupiah(success.subtotal)} />
          <Row label="Total" value={formatRupiah(success.totalAmount)} bold />
          <Row label="Metode Bayar" value={success.paymentSummaryLabel} />
          {success.changeAmount > 0 && <Row label="Kembalian" value={formatRupiah(success.changeAmount)} />}
        </div>

        <div className="mt-5 space-y-2 print:hidden">
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <span>Ukuran kertas:</span>
            {(Object.keys(PAPER_WIDTHS) as PaperWidth[]).map((w) => (
              <button
                key={w}
                onClick={() => setPaperWidth(w)}
                className={
                  paperWidth === w
                    ? "rounded-md bg-brand-100 px-2 py-0.5 font-medium text-brand-700"
                    : "rounded-md px-2 py-0.5 text-slate-500 hover:bg-slate-100"
                }
              >
                {w}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="btn btn-secondary flex-1 py-2">
              <Printer size={14} className="mr-1.5 inline" /> Cetak
            </button>
            <button onClick={onNewSale} className="btn btn-primary flex-1 py-2">
              Transaksi Baru
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={bold ? "flex justify-between font-semibold text-slate-900" : "flex justify-between text-slate-600"}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="field-input mt-1" />
    </div>
  );
}
