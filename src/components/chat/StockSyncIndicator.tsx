"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { AlertCircle, CloudOff, RefreshCw } from "lucide-react";
import { formatSyncAge, useStockSyncStore } from "@/src/lib/stores/stock-sync-store";

/**
 * Baris kecil di header /chat: kapan data stok offline (IndexedDB) terakhir
 * disinkronkan, status sinkron, dan tombol "Sinkron sekarang".
 */
export function StockSyncIndicator({ isOnline, onSync }: { isOnline: boolean; onSync: () => void }) {
  const { status, lastSyncedAt } = useStockSyncStore();
  // Perbarui teks "N mnt lalu" tanpa menunggu render lain.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const syncing = status === "syncing";
  const age = formatSyncAge(lastSyncedAt);
  let text: string;
  if (!isOnline) text = `Offline · data stok terakhir ${age}`;
  else if (syncing) text = "Menyinkronkan data stok…";
  else if (status === "error") text = `Gagal sinkron · data terakhir ${age}`;
  else text = `Data stok tersinkron ${age}`;

  const Icon = !isOnline ? CloudOff : status === "error" ? AlertCircle : RefreshCw;

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-500" aria-live="polite">
      <Icon
        size={11}
        aria-hidden
        className={clsx("shrink-0", syncing && "animate-spin", status === "error" && isOnline && "text-amber-600")}
      />
      <span className={clsx("truncate", status === "error" && isOnline && "text-amber-700")}>{text}</span>
      {isOnline && !syncing && (
        <button
          type="button"
          onClick={onSync}
          className="shrink-0 font-medium text-brand-600 hover:underline"
        >
          {status === "error" ? "Coba lagi" : "Sinkron sekarang"}
        </button>
      )}
    </div>
  );
}
