"use client";

import { useState } from "react";
import { ShieldCheck, AlertCircle } from "lucide-react";
import type { PendingConfirmation } from "@/src/lib/agents/orchestrator";

interface Props {
  pending: PendingConfirmation;
  businessSlug: string;
  username: string;
  staffId: string;
  onResolved: (result: { ok: boolean; message: string }) => void;
  onCancel: () => void;
}

export function PinConfirmDialog({
  pending,
  businessSlug,
  username,
  staffId,
  onResolved,
  onCancel,
}: Props) {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sebelumnya Batal cuma setPendingConfirmation(null) di ChatWindow — baris
  // agent_audit_log tetap 'pending' selamanya & (sejak reserve_stock aktif)
  // reservasi stok tidak pernah dilepas. Panggil reject dulu, baru tutup dialog.
  // Tetap tutup dialog meski reject gagal (mis. jaringan putus) — jangan sampai
  // staf terjebak tidak bisa membatalkan; expire_stale_pending_reservations
  // jadi jaring pengaman kalau reject-nya sendiri gagal.
  async function handleCancel() {
    setCancelling(true);
    try {
      await fetch("/api/agent/tools/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_log_id: pending.audit_log_id }),
      });
    } catch {
      // sengaja diabaikan — lihat komentar di atas
    } finally {
      onCancel();
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const endpoint =
      pending.tool_name === "updateStock"
        ? "/api/agent/tools/update-stock/confirm"
        : "/api/agent/tools/transfer-stock/confirm";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audit_log_id: pending.audit_log_id,
          staff_id: staffId,
          business_slug: businessSlug,
          username,
          pin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal mengonfirmasi");
        setSubmitting(false);
        return;
      }
      onResolved({ ok: true, message: "Transaksi berhasil dicatat." });
    } catch {
      setError("Terjadi kesalahan jaringan, coba lagi.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-[1px] sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-popover">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <ShieldCheck size={16} />
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            Konfirmasi PIN
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">{pending.message}</p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Masukkan PIN"
          maxLength={12}
          className="field-input mt-4 text-center text-lg tracking-widest"
        />

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleCancel}
            disabled={submitting || cancelling}
            className="btn btn-secondary flex-1 py-2"
          >
            {cancelling ? "Membatalkan…" : "Batal"}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || pin.length < 6}
            className="btn btn-primary flex-1 py-2"
          >
            {submitting ? "Memproses…" : "Konfirmasi"}
          </button>
        </div>
      </div>
    </div>
  );
}
