"use client";

import { useState } from "react";
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">
          Konfirmasi PIN
        </h2>
        <p className="mt-1 text-sm text-slate-600">{pending.message}</p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Masukkan PIN"
          maxLength={12}
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-widest focus:border-brand-600 focus:outline-none"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleCancel}
            disabled={submitting || cancelling}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {cancelling ? "Membatalkan…" : "Batal"}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || pin.length < 6}
            className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Memproses…" : "Konfirmasi"}
          </button>
        </div>
      </div>
    </div>
  );
}
