"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { validateChangePin } from "@/src/lib/auth/change-pin";

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 12);

export function ChangePinForm() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateChangePin({ currentPin, newPin, confirmPin });
    if (problem) {
      setMessage({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/account/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) {
      setMessage({ ok: false, text: data.error ?? "Gagal mengganti PIN. Coba lagi." });
      return;
    }
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setMessage({ ok: true, text: "PIN berhasil diganti. Pakai PIN baru saat masuk dan konfirmasi transaksi." });
  }

  const field = "field-input w-full text-center tracking-widest";
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm text-slate-700">
        PIN lama
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={currentPin}
          onChange={(e) => setCurrentPin(digits(e.target.value))}
          className={`${field} mt-1`}
          required
        />
      </label>
      <label className="block text-sm text-slate-700">
        PIN baru <span className="text-xs text-slate-400">(minimal 6 digit angka)</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={newPin}
          onChange={(e) => setNewPin(digits(e.target.value))}
          className={`${field} mt-1`}
          minLength={6}
          required
        />
      </label>
      <label className="block text-sm text-slate-700">
        Ulangi PIN baru
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(digits(e.target.value))}
          className={`${field} mt-1`}
          minLength={6}
          required
        />
      </label>
      {message && (
        <div
          role={message.ok ? "status" : "alert"}
          className={
            message.ok
              ? "flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              : "flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          }
        >
          {message.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center">
        {busy ? "Menyimpan…" : "Simpan PIN baru"}
      </button>
    </form>
  );
}
