"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useSerwist } from "@serwist/turbopack/react";
import { useModelStore } from "@/src/lib/stores/model-store";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Service worker baru menunggu (skipWaiting: false di sw.ts) sampai staf
 * sendiri memilih memuat ulang, supaya aset tidak berganti di tengah
 * transaksi atau unduhan model.
 */
export function UpdateAvailableToast() {
  const { serwist } = useSerwist();
  const [waiting, setWaiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const modelBusy = useModelStore((s) => s.status === "loading");

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => setWaiting(true);
    serwist.addEventListener("waiting", onWaiting);

    // Aplikasi yang dipasang sering dibiarkan terbuka berhari-hari tanpa
    // navigasi penuh, jadi cek versi baru secara berkala juga.
    const check = () => {
      // Tanpa controller berarti registrasi belum/gagal; update() hanya akan melempar.
      if (document.visibilityState === "visible" && navigator.serviceWorker.controller) {
        serwist.update().catch(() => {});
      }
    };
    const id = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      serwist.removeEventListener("waiting", onWaiting);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [serwist]);

  if (!waiting || dismissed || !serwist) return null;

  function applyUpdate() {
    serwist!.addEventListener("controlling", () => window.location.reload());
    serwist!.messageSkipWaiting();
  }

  return (
    <div className="pointer-events-auto card flex w-full max-w-sm items-start gap-3 p-3 shadow-lg animate-fade-in-up" role="status">
      <RefreshCw size={16} className="mt-0.5 shrink-0 text-brand-600" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Versi baru tersedia</p>
          <p className="text-xs text-slate-500">
            {modelBusy
              ? "Muat ulang sekarang akan menjeda unduhan asisten AI (bisa dilanjutkan lagi)."
              : "Muat ulang untuk memakai versi terbaru."}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={applyUpdate} className="btn btn-primary !px-3 !py-1 !text-xs">
            Muat ulang
          </button>
          <button onClick={() => setDismissed(true)} className="btn btn-ghost !px-3 !py-1 !text-xs">
            Nanti
          </button>
        </div>
      </div>
      <button onClick={() => setDismissed(true)} className="text-slate-400 hover:text-slate-600" aria-label="Tutup">
        <X size={14} />
      </button>
    </div>
  );
}
