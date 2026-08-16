"use client";

import { useEffect, useState } from "react";
import {
  enablePushNotifications,
  getPushSupportStatus,
  type PushSubscriptionStatus,
} from "@/src/lib/notifications/subscribe-client";

/**
 * Ditaruh di header chat. Hanya tampil kalau notifikasi belum aktif dan device
 * mendukungnya — tidak mengganggu staf yang sudah subscribe atau pakai device lama.
 */
export function EnableNotificationsBanner() {
  const [status, setStatus] = useState<PushSubscriptionStatus>("unsupported");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(getPushSupportStatus());
  }, []);

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

  if (status === "unsupported" || status === "granted" || status === "denied")
    return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs">
      <span className="text-amber-800">
        Aktifkan notifikasi supaya dapat kabar saran restock & stok menipis.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {error && <span className="text-red-600">{error}</span>}
        <button
          onClick={handleEnable}
          disabled={busy}
          className="rounded-full bg-amber-600 px-3 py-1 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Memproses…" : "Aktifkan"}
        </button>
      </div>
    </div>
  );
}
