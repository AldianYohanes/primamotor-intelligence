"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  Building2,
  Check,
  Download,
  FlaskConical,
  HardDrive,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Pause,
  Play,
  ShoppingCart,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { AppModule, ModuleKey } from "@/src/lib/auth/rbac";
import { useModelStore } from "@/src/lib/stores/model-store";
import { formatBytes, formatEta, formatSpeed } from "@/src/lib/agents/model-progress";
import { GearAnimation } from "./GearAnimation";

const TIPS = [
  "Tanya stok langsung: “ada radiator 240 gak?”",
  "Catat barang masuk: “masuk barang 10 pcs filter oli”",
  "Pindah stok: “transfer 2 kampas rem ke gudang”",
  "Setiap transaksi tetap minta konfirmasi PIN, jadi aman kalau AI salah tangkap.",
  "Setelah terunduh, asisten tetap bisa menjawab cari stok saat sinyal hilang.",
  "Model disimpan di perangkat ini, jadi unduhan hanya sekali.",
];

const SHORTCUT_ICONS: Record<ModuleKey, LucideIcon> = {
  chat: MessageSquare,
  pos: ShoppingCart,
  portal: LayoutDashboard,
  eval: FlaskConical,
  tenants: Building2,
};

interface NetworkInformationLike {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
}

function useConnectionHints() {
  const [hints, setHints] = useState<{ cellular: boolean; freeBytes: number | null }>({
    cellular: false,
    freeBytes: null,
  });
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    const cellular = connection?.type === "cellular" || connection?.saveData === true;
    navigator.storage
      ?.estimate?.()
      .then(({ quota, usage }) =>
        setHints({ cellular, freeBytes: quota != null && usage != null ? quota - usage : null }),
      )
      .catch(() => setHints({ cellular, freeBytes: null }));
  }, []);
  return hints;
}

function useRotatingTip(active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % TIPS.length), 7000);
    return () => window.clearInterval(id);
  }, [active]);
  return TIPS[index];
}

function ProgressBar({ fraction, indeterminate }: { fraction: number; indeterminate?: boolean }) {
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(fraction * 100)}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 w-2/5 rounded-full bg-brand-600 animate-indeterminate" />
      ) : (
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, fraction * 100)}%` }}
        />
      )}
    </div>
  );
}

const STEPS = [
  { key: "download", label: "Unduh" },
  { key: "gpu", label: "Muat ke GPU" },
  { key: "ready", label: "Siap" },
] as const;

function Steps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center justify-center gap-2 text-[11px]">
      {STEPS.map((step, i) => (
        <li key={step.key} className="flex items-center gap-2">
          <span
            className={clsx(
              "flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
              i < current && "bg-emerald-50 text-emerald-700",
              i === current && "bg-brand-50 text-brand-700",
              i > current && "bg-slate-100 text-slate-400",
            )}
          >
            {i < current && <Check size={11} />}
            {step.label}
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-3 bg-slate-300" />}
        </li>
      ))}
    </ol>
  );
}

function Shortcuts({ modules }: { modules: AppModule[] }) {
  if (modules.length === 0) return null;
  return (
    <div className="border-t border-slate-100 pt-3">
      <p className="mb-2 text-xs text-slate-500">
        Sambil menunggu, buka halaman lain. Unduhan tetap berjalan.
      </p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {modules.map(({ key, href, label }) => {
          const Icon = SHORTCUT_ICONS[key];
          return (
            <Link key={key} href={href} className="btn btn-secondary !px-2.5 !py-1 !text-xs">
              <Icon size={13} />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pengganti layar "sedang mengunduh" polos di chat: tombol mulai dengan
 * peringatan ukuran, lalu progres dengan MB, kecepatan, perkiraan sisa waktu,
 * dan tombol jeda/lanjut.
 */
export function ModelSetupPanel({ shortcuts }: { shortcuts: AppModule[] }) {
  const {
    status,
    phase,
    totalBytes,
    cachedBytes,
    downloadedBytes,
    bytesPerSecond,
    secondsLeft,
    loadFraction,
    notice,
    start,
    cancel,
  } = useModelStore();
  const { cellular, freeBytes } = useConnectionHints();
  const busy = status === "loading";
  const tip = useRotatingTip(busy);
  const [cancelling, setCancelling] = useState(false);

  if (status === "idle" || status === "checking") {
    return (
      <div className="card mx-auto w-full max-w-sm space-y-3 p-6 text-center">
        <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-slate-200" />
        <div className="mx-auto h-3 w-40 animate-pulse rounded bg-slate-200" />
        <p className="text-xs text-slate-400">Memeriksa asisten AI di perangkat ini…</p>
      </div>
    );
  }

  if (status === "needs-download" || status === "paused") {
    const remaining = totalBytes != null ? Math.max(0, totalBytes - cachedBytes) : null;
    const notEnoughSpace = remaining != null && freeBytes != null && freeBytes < remaining;
    const paused = status === "paused";
    return (
      <div className="card mx-auto w-full max-w-sm space-y-4 p-6 text-center animate-fade-in-up">
        <div className="flex justify-center">
          <GearAnimation paused size={44} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-900">
            {paused ? "Unduhan asisten AI terjeda" : "Unduh asisten AI"}
          </p>
          {paused && totalBytes ? (
            <>
              <ProgressBar fraction={cachedBytes / totalBytes} />
              <p className="text-xs text-slate-500">
                {formatBytes(cachedBytes)} dari {formatBytes(totalBytes)} sudah tersimpan (
                {Math.floor((cachedBytes / totalBytes) * 100)}%)
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              Asisten AI berjalan langsung di perangkat ini, jadi modelnya perlu diunduh sekali
              {totalBytes ? <> (sekitar <b>{formatBytes(totalBytes)}</b>)</> : null}.
            </p>
          )}
        </div>

        {notice && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{notice}</p>
        )}

        <div
          className={clsx(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs",
            cellular ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600",
          )}
        >
          <Wifi size={14} className="mt-0.5 shrink-0" />
          <span>
            {cellular
              ? "Sepertinya sedang pakai data seluler. Sebaiknya sambungkan ke Wi-Fi dulu supaya kuota tidak habis."
              : "Sebaiknya pakai Wi-Fi. Unduhan bisa dijeda dan dilanjutkan kapan saja."}
          </span>
        </div>

        {notEnoughSpace && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-xs text-red-700">
            <HardDrive size={14} className="mt-0.5 shrink-0" />
            <span>
              Ruang penyimpanan browser tinggal {formatBytes(freeBytes!)}, kurang untuk sisa unduhan{" "}
              {formatBytes(remaining!)}. Kosongkan memori perangkat dulu.
            </span>
          </div>
        )}

        <button onClick={start} className="btn btn-primary w-full justify-center">
          {paused ? <Play size={15} /> : <Download size={15} />}
          {paused
            ? `Lanjutkan unduhan${remaining ? ` (sisa ${formatBytes(remaining)})` : ""}`
            : "Unduh asisten AI"}
        </button>
      </div>
    );
  }

  if (status !== "loading") return null;

  const downloading = phase === "downloading";
  const stepIndex: 0 | 1 | 2 = phase === "loading" || phase === "compiling" ? 1 : 0;
  const fraction =
    phase === "downloading" && totalBytes
      ? downloadedBytes / totalBytes
      : phase === "loading"
        ? loadFraction
        : 0;
  const indeterminate = phase === "preparing" || phase === "compiling" || (downloading && !totalBytes);

  let title = "Menyiapkan unduhan…";
  if (downloading) title = "Mengunduh asisten AI";
  if (phase === "loading") title = "Memuat model ke GPU";
  if (phase === "compiling") title = "Menyiapkan GPU, hampir selesai…";

  return (
    <div className="card mx-auto w-full max-w-sm space-y-4 p-6 text-center animate-fade-in-up">
      <div className="flex justify-center">
        <GearAnimation size={52} />
      </div>
      <Steps current={stepIndex} />

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {!indeterminate && (
            <p className="text-sm font-semibold tabular-nums text-brand-700">
              {Math.floor(fraction * 100)}%
            </p>
          )}
        </div>
        <ProgressBar fraction={fraction} indeterminate={indeterminate} />
        {downloading && (
          <div className="flex justify-between gap-2 text-xs tabular-nums text-slate-500">
            <span>
              {formatBytes(downloadedBytes)}
              {totalBytes ? ` / ${formatBytes(totalBytes)}` : ""}
            </span>
            <span>{bytesPerSecond ? formatSpeed(bytesPerSecond) : ""}</span>
          </div>
        )}
        <p className="text-xs font-medium text-slate-600" aria-live="polite">
          {downloading
            ? secondsLeft != null
              ? formatEta(secondsLeft)
              : "Menghitung perkiraan waktu…"
            : phase === "loading"
              ? "Membaca model dari penyimpanan perangkat"
              : phase === "compiling"
                ? "Biasanya kurang dari 1 menit"
                : "Mengambil konfigurasi model"}
        </p>
      </div>

      <div
        key={tip}
        className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-left text-xs text-brand-800 animate-fade-in-up"
      >
        <Lightbulb size={14} className="mt-0.5 shrink-0" />
        <span>{tip}</span>
      </div>

      {(downloading || phase === "preparing") && (
        <button
          onClick={async () => {
            setCancelling(true);
            await cancel();
            setCancelling(false);
          }}
          disabled={cancelling}
          className="btn btn-secondary w-full justify-center"
        >
          <Pause size={14} />
          {cancelling ? "Menjeda…" : "Jeda unduhan"}
        </button>
      )}
      {downloading && (
        <p className="-mt-2 text-[11px] text-slate-400">
          Bagian yang sudah terunduh tetap tersimpan.
        </p>
      )}

      <Shortcuts modules={shortcuts} />
    </div>
  );
}
