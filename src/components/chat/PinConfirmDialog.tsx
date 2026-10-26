"use client";

import { useState } from "react";
import { ShieldCheck, AlertCircle } from "lucide-react";
import type { PendingConfirmation } from "@/src/lib/agents/orchestrator";
import { unlockTimeHint } from "@/src/lib/auth/lockout-messages";
import { pinDigitsLeft } from "./chat-ui";

export const CANCELLED_MESSAGE = "Transaksi dibatalkan. Stok tidak berubah.";

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
  async function rejectPending() {
    try {
      await fetch("/api/agent/tools/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_log_id: pending.audit_log_id }),
      });
    } catch {
      // sengaja diabaikan — lihat komentar di atas
    }
  }

  async function handleCancel() {
    setCancelling(true);
    await rejectPending();
    onCancel();
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
        const reason = `${data.error ?? "Gagal mengonfirmasi"}${unlockTimeHint(data.locked_until)}`;
        // Terkunci: PIN tidak bisa dicoba lagi sekarang, jadi transaksi dibatalkan
        // (reservasi stok dilepas) dan alasannya masuk ke chat, bukan dialog yang macet.
        if (res.status === 423) {
          await rejectPending();
          onResolved({ ok: false, message: `${reason} ${CANCELLED_MESSAGE}` });
          return;
        }
        setError(reason);
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[1px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-dialog-title"
        aria-describedby="pin-dialog-desc"
        onKeyDown={(e) => {
          // Escape menutup dialog seperti Batal, kecuali permintaan sedang diproses.
          if (e.key === "Escape" && !submitting && !cancelling) void handleCancel();
        }}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-popover"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <ShieldCheck size={16} />
          </div>
          <h2 id="pin-dialog-title" className="text-base font-semibold text-slate-900">
            Konfirmasi PIN
          </h2>
        </div>
        <p id="pin-dialog-desc" className="mt-2 text-sm text-slate-600">{pending.message}</p>
        {pending.warning && (
          <p role="alert" className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {pending.warning}
          </p>
        )}

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !submitting && pin.length >= 6) handleConfirm();
          }}
          placeholder="Masukkan PIN"
          aria-label="PIN"
          aria-invalid={error !== null}
          aria-describedby={error ? "pin-dialog-error" : undefined}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={12}
          className="field-input mt-4 min-h-12 text-center !text-xl tracking-widest"
        />
        {pin.length > 0 && pinDigitsLeft(pin) > 0 && (
          <p className="mt-1 text-center text-xs text-slate-500">
            Masih kurang {pinDigitsLeft(pin)} angka (PIN minimal 6 angka)
          </p>
        )}

        {error && (
          <div id="pin-dialog-error" role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleCancel}
            disabled={submitting || cancelling}
            className="btn btn-secondary min-h-11 flex-1 !text-sm"
          >
            {cancelling ? "Membatalkan…" : "Batal"}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || pin.length < 6}
            className="btn btn-primary min-h-11 flex-1 !text-sm"
          >
            {submitting ? "Memproses…" : "Konfirmasi"}
          </button>
        </div>
      </div>
    </div>
  );
}
