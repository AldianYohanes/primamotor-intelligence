"use client";

import { useState } from "react";
import clsx from "clsx";

/** Saklar "Tampilkan detail teknis" di chat. Disimpan di akun (bukan perangkat), default mati. */
export function ModelDetailsSetting({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/model-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      setEnabled(next);
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-800">Detail teknis di chat</p>
          <p className="text-xs text-slate-500">
            Waktu, token, nama model, dan langkah proses di bawah jawaban. Berlaku di semua perangkat akun ini.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Tampilkan detail teknis di chat"
          disabled={busy}
          onClick={toggle}
          className={clsx(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
            enabled ? "bg-brand-600" : "bg-slate-300",
          )}
        >
          <span
            className={clsx(
              "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
              enabled && "translate-x-5",
            )}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
