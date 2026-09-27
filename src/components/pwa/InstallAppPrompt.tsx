"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Smartphone, X } from "lucide-react";
import { isStandalone, useInstallPrompt } from "@/src/lib/pwa/install-prompt";

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 7;
// Jangan menawarkan install di halaman publik/login; tawarkan setelah staf
// benar-benar memakai app.
const HIDDEN_PREFIXES = ["/login", "/signup", "/~offline"];

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Chrome Android menembakkan `beforeinstallprompt` saat app memenuhi syarat
 * install. Event ditahan lalu ditawarkan lewat banner sendiri yang bisa
 * ditutup, alih-alih mini-infobar bawaan browser.
 */
export function InstallAppPrompt() {
  const pathname = usePathname();
  const deferred = useInstallPrompt((s) => s.deferred);
  const installApp = useInstallPrompt((s) => s.install);
  // Dibaca sekali saat render pertama; setelah ditutup cukup disembunyikan.
  const [hidden, setHidden] = useState(() => typeof window !== "undefined" && (recentlyDismissed() || isStandalone()));

  if (!deferred || hidden || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === "/") {
    return null;
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // mode privat: cukup sembunyikan untuk sesi ini
    }
    setHidden(true);
  }

  async function install() {
    const outcome = await installApp();
    if (outcome === "dismissed") dismiss();
  }

  return (
    <div className="pointer-events-auto card flex w-full max-w-sm items-start gap-3 p-3 shadow-lg animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Smartphone size={16} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Pasang aplikasi Prima Motor</p>
          <p className="text-xs text-slate-500">
            Buka langsung dari layar utama, tampil layar penuh, dan tetap bisa dibuka saat sinyal
            hilang.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={install} className="btn btn-primary !px-3 !py-1 !text-xs">
            Pasang
          </button>
          <button onClick={dismiss} className="btn btn-ghost !px-3 !py-1 !text-xs">
            Nanti saja
          </button>
        </div>
      </div>
      <button onClick={dismiss} className="text-slate-400 hover:text-slate-600" aria-label="Tutup">
        <X size={14} />
      </button>
    </div>
  );
}
