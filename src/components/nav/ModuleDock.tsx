"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import type { AppModule, ModuleKey } from "@/src/lib/auth/rbac";
import { useModelStore } from "@/src/lib/stores/model-store";
import { formatEta } from "@/src/lib/agents/model-progress";
import { AccountPanel, initials, type AccountInfo } from "./AccountPanel";

const ICONS: Partial<Record<ModuleKey, LucideIcon>> = {
  chat: MessageSquare,
  pos: ShoppingCart,
  portal: LayoutDashboard,
  eval: FlaskConical,
};

function activeModule(pathname: string): ModuleKey | null {
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/pos")) return "pos";
  if (pathname.startsWith("/eval")) return "eval";
  if (pathname.startsWith("/admin/tenants")) return null;
  if (pathname.startsWith("/admin")) return "portal";
  return null;
}

/** Progres unduh/muat model AI sebagai cincin di ikon Chat (pengganti pill lama). */
function useModelProgress() {
  const status = useModelStore((s) => s.status);
  const phase = useModelStore((s) => s.phase);
  const totalBytes = useModelStore((s) => s.totalBytes);
  const downloadedBytes = useModelStore((s) => s.downloadedBytes);
  const cachedBytes = useModelStore((s) => s.cachedBytes);
  const loadFraction = useModelStore((s) => s.loadFraction);
  const secondsLeft = useModelStore((s) => s.secondsLeft);

  if (status === "loading") {
    if (phase === "downloading" && totalBytes) {
      const fraction = downloadedBytes / totalBytes;
      const eta = secondsLeft != null ? ` · ${formatEta(secondsLeft)}` : "";
      return { fraction, paused: false, label: `Mengunduh AI ${Math.floor(fraction * 100)}%${eta}` };
    }
    if (phase === "loading") {
      return { fraction: loadFraction, paused: false, label: `Memuat AI ${Math.floor(loadFraction * 100)}%` };
    }
    return { fraction: null, paused: false, label: "Menyiapkan asisten AI…" };
  }
  if (status === "paused" && totalBytes && cachedBytes > 0) {
    return { fraction: cachedBytes / totalBytes, paused: true, label: "Unduhan AI terjeda" };
  }
  return null;
}

function ProgressRing({ fraction, paused }: { fraction: number | null; paused: boolean }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-200" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className={clsx(paused ? "stroke-slate-400" : "stroke-brand-600", fraction == null && "animate-gear")}
        strokeDasharray={c}
        strokeDashoffset={fraction == null ? c * 0.75 : c * (1 - Math.min(1, fraction))}
        style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
      />
    </svg>
  );
}

interface Props {
  modules: AppModule[];
  account: AccountInfo;
}

/**
 * Dock navigasi mengambang di kanan atas: pindah modul (Chat / Kasir /
 * Portal / Evaluasi, sesuai role) + menu Account. Satu-satunya navigasi antar
 * modul; header halaman menyisakan ruang selebar dock lewat --dock-w.
 */
export function ModuleDock({ modules, account }: Props) {
  const pathname = usePathname();
  const current = activeModule(pathname);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const progress = useModelProgress();
  const items = modules.filter((m) => ICONS[m.key]);

  // Header halaman membaca lebar dock supaya judul/aksi tidak tertimpa.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--dock-w", `${el.offsetWidth}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--dock-w");
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed right-2 top-2 z-40 sm:right-3">
      <nav
        aria-label="Pindah modul"
        className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur"
      >
        {items.map((m) => {
          const Icon = ICONS[m.key]!;
          const active = m.key === current;
          const ring = m.key === "chat" && progress && !active ? progress : null;
          return (
            <Link
              key={m.key}
              href={m.href}
              aria-current={active ? "page" : undefined}
              title={ring ? `${m.label} · ${ring.label}` : m.label}
              className={clsx(
                "relative flex h-9 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors",
                active
                  ? "bg-brand-600 px-3 text-white"
                  : "w-9 text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {ring && <ProgressRing fraction={ring.fraction} paused={ring.paused} />}
              <Icon size={16} />
              {active && <span className="hidden sm:inline">{m.label}</span>}
              <span className="sr-only">{ring ? ring.label : m.label}</span>
            </Link>
          );
        })}

        <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Akun"
          className={clsx(
            "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-colors",
            account.isForeignTenant ? "bg-amber-500 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100",
            open && "ring-2 ring-brand-300",
          )}
        >
          {initials(account.fullName)}
          <span className="sr-only">Akun {account.fullName}</span>
        </button>
      </nav>

      {open && (
        <div
          role="dialog"
          aria-label="Akun"
          className="card absolute right-0 top-full mt-2 max-h-[calc(100dvh-4.5rem)] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto shadow-lg animate-fade-in-up"
        >
          <AccountPanel account={account} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
