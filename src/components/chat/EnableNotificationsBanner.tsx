"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import {
  enablePushNotifications,
  getPushSupportStatus,
  type PushSubscriptionStatus,
} from "@/src/lib/notifications/subscribe-client";

const DISMISS_KEY = "push-banner-dismissed-at";
const DISMISS_DAYS = 7;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Ditaruh di header chat. Hanya tampil kalau notifikasi belum aktif dan device
 * mendukungnya — tidak mengganggu staf yang sudah subscribe atau pakai device lama.
 */
export function EnableNotificationsBanner() {
  const [status, setStatus] = useState<PushSubscriptionStatus>("unsupported");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setStatus(getPushSupportStatus());
    setDismissed(recentlyDismissed());
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // mode privat: cukup sembunyikan untuk sesi ini
    }
    setDismissed(true);
  }

  async function handleEnable() {
    setBusy(true);
    setError(null);
    const result = await enablePushNotifications();
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      setStatus(getPushSupportStatus());
      return;
    }
    setStatus("granted");
  }

  if (dismissed || status === "unsupported" || status === "granted" || status === "denied") return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-amber-800">
        <BellRing size={14} className="shrink-0" />
        Aktifkan notifikasi supaya dapat kabar saran restock & stok menipis.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {error && <span className="text-red-600">{error}</span>}
        <button
          onClick={handleEnable}
          disabled={busy}
          className="rounded-full bg-amber-600 px-3 py-1 font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? "Memproses…" : "Aktifkan"}
        </button>
        <button
          onClick={dismiss}
          aria-label="Sembunyikan pengingat notifikasi"
          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full text-amber-800 hover:bg-amber-100"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
