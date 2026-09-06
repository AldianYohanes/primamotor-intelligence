"use client";

import { useState } from "react";
import { X, Search, UserPlus, AlertCircle } from "lucide-react";
import { useGetCustomers } from "./hooks/use-get-customers";
import { useGetCustomerDetail } from "./hooks/use-get-customer-detail";
import { usePostCustomer } from "./hooks/use-post-customer";
import { usePostCustomerPayment } from "./hooks/use-post-payment";

const PAYMENT_LABELS: Record<string, string> = { cash: "Tunai", transfer: "Transfer Bank", qris: "QRIS", card: "Kartu" };

/**
 * modules/customers/Component.tsx — modul admin untuk kelola pelanggan piutang
 * (bengkel langganan dsb, lihat migration 0027). Dibatasi admin/owner di sisi
 * server untuk create pelanggan & set credit_limit (§12); catat pelunasan
 * boleh siapa saja (kasir harian terima cicilan).
 */
export function CustomersModule() {
  const [query, setQuery] = useState("");
  const { customers, isLoading, error, refresh } = useGetCustomers(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Pelanggan Piutang</h1>
        <button onClick={() => setShowAddForm(true)} className="btn btn-primary">
          <UserPlus size={15} className="mr-1.5 inline" /> Tambah Pelanggan
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama pelanggan…"
          className="field-input w-full pl-9"
        />
      </div>

      {error && <p className="text-sm text-red-600">Gagal memuat pelanggan: {error.message}</p>}
      {isLoading && <p className="text-sm text-slate-400">Memuat…</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Nama</th>
              <th className="px-4 py-2.5">Telepon</th>
              <th className="px-4 py-2.5">Limit</th>
              <th className="px-4 py-2.5">Piutang Berjalan</th>
              <th className="px-4 py-2.5">Sisa Limit</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoading && customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Belum ada pelanggan.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-2.5 text-slate-600">{c.phone}</td>
                <td className="px-4 py-2.5 text-slate-600">{c.creditLimitFormatted}</td>
                <td className="px-4 py-2.5 text-slate-900">{c.balanceFormatted}</td>
                <td className={c.hasOverdraft ? "px-4 py-2.5 font-medium text-red-600" : "px-4 py-2.5 text-emerald-700"}>
                  {c.availableCreditFormatted}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setSelectedId(c.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddForm && (
        <AddCustomerDialog
          onClose={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false);
            refresh();
          }}
        />
      )}

      {selectedId && (
        <CustomerDetailDialog
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          onPaymentRecorded={() => refresh()}
        />
      )}
    </div>
  );
}

function AddCustomerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { createCustomer, isCreating } = usePostCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [creditLimit, setCreditLimit] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCustomer({ name, phone: phone || undefined, credit_limit: creditLimit, notes: notes || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah pelanggan");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-popover">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Tambah Pelanggan</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="field-label">Nama</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="field-input mt-1" />
          </div>
          <div>
            <label className="field-label">No. Telepon (opsional)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field-input mt-1" />
          </div>
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
          <div>
            <label className="field-label">Catatan (opsional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="field-input mt-1" />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={isCreating} className="btn btn-primary w-full py-2">
            {isCreating ? "Menyimpan…" : "Simpan"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CustomerDetailDialog({
  customerId,
  onClose,
  onPaymentRecorded,
}: {
  customerId: string;
  onClose: () => void;
  onPaymentRecorded: () => void;
}) {
  const { detail, isLoading, refresh } = useGetCustomerDetail(customerId);
  const { recordPayment, isRecording } = usePostCustomerPayment(customerId);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<"cash" | "transfer" | "qris" | "card">("cash");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await recordPayment({ amount, payment_method: method });
      setShowPaymentForm(false);
      setAmount(0);
      await refresh();
      onPaymentRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat pelunasan");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-popover">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Detail Pelanggan</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {isLoading && <p className="py-6 text-center text-sm text-slate-400">Memuat…</p>}

        {detail && !showPaymentForm && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-base font-semibold text-slate-900">{detail.name}</p>
              <p className="text-xs text-slate-500">{detail.phone}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3 text-center">
              <div>
                <p className="text-xs text-slate-500">Limit</p>
                <p className="font-medium text-slate-900">{detail.creditLimitFormatted}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Piutang</p>
                <p className="font-medium text-slate-900">{detail.balanceFormatted}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sisa</p>
                <p className={detail.hasOverdraft ? "font-medium text-red-600" : "font-medium text-emerald-700"}>
                  {detail.availableCreditFormatted}
                </p>
              </div>
            </div>

            <button onClick={() => setShowPaymentForm(true)} className="btn btn-primary w-full py-2">
              Catat Pelunasan
            </button>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Nota Piutang Terbaru</p>
              {detail.recentSales.length === 0 && <p className="text-xs text-slate-400">Belum ada.</p>}
              <div className="space-y-1">
                {detail.recentSales.map((s) => (
                  <div key={s.id} className="flex justify-between text-xs">
                    <span className="font-mono text-slate-500">{s.saleNumber}</span>
                    <span className="text-slate-600">{s.dateFormatted}</span>
                    <span className="font-medium text-slate-900">{s.totalFormatted}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Riwayat Pelunasan</p>
              {detail.payments.length === 0 && <p className="text-xs text-slate-400">Belum ada.</p>}
              <div className="space-y-1">
                {detail.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <span className="text-slate-600">
                      {p.dateFormatted} · {p.methodLabel}
                    </span>
                    <span className="font-medium text-emerald-700">{p.amountFormatted}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {detail && showPaymentForm && (
          <form onSubmit={handleSubmitPayment} className="space-y-3">
            <div>
              <label className="field-label">Jumlah Pelunasan (Rp)</label>
              <input
                type="number"
                min={1}
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="field-input mt-1"
              />
            </div>
            <div>
              <label className="field-label">Metode</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="field-input mt-1">
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowPaymentForm(false)} disabled={isRecording} className="btn btn-secondary flex-1 py-2">
                Batal
              </button>
              <button type="submit" disabled={isRecording || amount <= 0} className="btn btn-primary flex-1 py-2">
                {isRecording ? "Memproses…" : "Simpan"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
