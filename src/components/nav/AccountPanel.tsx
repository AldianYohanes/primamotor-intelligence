"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  BellRing,
  Building2,
  ChevronDown,
  Cpu,
  KeyRound,
  LogOut,
  Rows3,
  Smartphone,
  Undo2,
} from "lucide-react";
import { DensitySetting } from "@/src/components/settings/DensitySetting";
import { logoutAndClear } from "@/src/lib/auth/logout-client";
import { enablePushNotifications, getPushSupportStatus } from "@/src/lib/notifications/subscribe-client";
import { isStandalone, useInstallPrompt } from "@/src/lib/pwa/install-prompt";
import { useModelStore } from "@/src/lib/stores/model-store";
import { formatBytes } from "@/src/lib/agents/model-progress";
import { MODEL_OPTIONS } from "@/src/lib/agents/model-options";

export interface AccountInfo {
  fullName: string;
  roleLabel: string;
  tenantName: string;
  isForeignTenant: boolean;
  canSwitchTenant: boolean;
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

function Section({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
}: {
  icon: typeof KeyRound;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
        aria-expanded={open}
      >
        <Icon size={15} className="shrink-0 text-slate-500" />
        <span className="flex-1">{title}</span>
        <ChevronDown size={14} className={clsx("text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-3 px-4 pb-3.5">{children}</div>}
    </div>
  );
}

function ChangePinForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 12);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ ok: false, text: "Konfirmasi PIN baru tidak sama" });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/account/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_pin: current, new_pin: next }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? "Gagal mengganti PIN" });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setMessage({ ok: true, text: "PIN berhasil diganti. Pakai PIN baru saat masuk dan konfirmasi transaksi." });
  }

  const field = "field-input !py-1.5 text-center tracking-widest";
  return (
    <form onSubmit={submit} className="space-y-2">
      <input type="password" inputMode="numeric" autoComplete="current-password" placeholder="PIN lama" value={current} onChange={(e) => setCurrent(digits(e.target.value))} className={field} required />
      <input type="password" inputMode="numeric" autoComplete="new-password" placeholder="PIN baru (min. 6 digit)" value={next} onChange={(e) => setNext(digits(e.target.value))} className={field} minLength={6} required />
      <input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Ulangi PIN baru" value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} className={field} minLength={6} required />
      {message && (
        <p className={clsx("text-xs", message.ok ? "text-emerald-700" : "text-red-600")}>{message.text}</p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center !py-1.5 !text-xs">
        {busy ? "Menyimpan…" : "Simpan PIN baru"}
      </button>
    </form>
  );
}

function DeviceRow({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500">{detail}</p>
      </div>
      {action}
    </div>
  );
}

const smallBtn = "btn btn-secondary shrink-0 !px-2.5 !py-1 !text-[11px]";

function DeviceSettings() {
  // Panel baru di-mount saat dibuka, jadi aman membaca API browser di initializer.
  const [push, setPush] = useState(() => getPushSupportStatus());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [standalone] = useState(() => isStandalone());
  const deferred = useInstallPrompt((s) => s.deferred);
  const install = useInstallPrompt((s) => s.install);

  const modelStatus = useModelStore((s) => s.status);
  const modelId = useModelStore((s) => s.modelId);
  const cachedBytes = useModelStore((s) => s.cachedBytes);
  const totalBytes = useModelStore((s) => s.totalBytes);
  const refreshInfo = useModelStore((s) => s.refreshInfo);
  const removeFromDevice = useModelStore((s) => s.removeFromDevice);
  const setModelId = useModelStore((s) => s.setModelId);
  const [removing, setRemoving] = useState(false);
  const [switchingModel, setSwitchingModel] = useState(false);

  useEffect(() => {
    refreshInfo().catch(() => {});
  }, [refreshInfo]);

  async function enablePush() {
    setPushBusy(true);
    setPushError(null);
    const result = await enablePushNotifications();
    setPushBusy(false);
    if (!result.ok) setPushError(result.reason);
    setPush(getPushSupportStatus());
  }

  const pushDetail =
    push === "granted" || push === "subscribed"
      ? "Aktif: kabar stok menipis & saran restock"
      : push === "denied"
        ? "Diblokir. Izinkan lewat pengaturan situs di browser."
        : push === "unsupported"
          ? "Tidak didukung browser/perangkat ini"
          : "Belum aktif";

  const modelBusy = modelStatus === "loading";
  const modelDetail =
    modelStatus === "ready"
      ? `Siap dipakai${cachedBytes ? ` · ${formatBytes(cachedBytes)} tersimpan` : ""}`
      : modelBusy
        ? "Sedang diunduh / dimuat"
        : cachedBytes > 0
          ? `${formatBytes(cachedBytes)}${totalBytes ? ` dari ${formatBytes(totalBytes)}` : ""} tersimpan`
          : "Belum diunduh";

  return (
    <>
      <DeviceRow
        title="Notifikasi"
        detail={pushError ?? pushDetail}
        action={
          push === "default" ? (
            <button onClick={enablePush} disabled={pushBusy} className={smallBtn}>
              <BellRing size={12} />
              {pushBusy ? "…" : "Aktifkan"}
            </button>
          ) : undefined
        }
      />
      <DeviceRow
        title="Aplikasi"
        detail={
          standalone
            ? "Sudah terpasang di perangkat ini"
            : deferred
              ? "Bisa dipasang ke layar utama"
              : "Pasang lewat menu browser → Tambahkan ke layar utama"
        }
        action={
          !standalone && deferred ? (
            <button onClick={() => install()} className={smallBtn}>
              <Smartphone size={12} />
              Pasang
            </button>
          ) : undefined
        }
      />
      <DeviceRow
        title="Model asisten AI"
        detail={modelDetail}
        action={
          !modelBusy && cachedBytes > 0 ? (
            <button
              onClick={async () => {
                if (!window.confirm("Hapus model AI dari perangkat ini? Asisten perlu diunduh ulang sebelum dipakai lagi.")) return;
                setRemoving(true);
                await removeFromDevice().catch(() => {});
                setRemoving(false);
              }}
              disabled={removing}
              className={clsx(smallBtn, "!text-red-700")}
            >
              {removing ? "Menghapus…" : "Hapus"}
            </button>
          ) : undefined
        }
      />
      <div className="pt-1">
        <label htmlFor="account-model-switch" className="mb-1 block text-[11px] font-medium text-slate-500">
          Ganti model AI {modelBusy && "(tunggu sampai selesai dulu)"}
        </label>
        <select
          id="account-model-switch"
          value={modelId}
          disabled={modelBusy || switchingModel}
          onChange={async (e) => {
            setSwitchingModel(true);
            await setModelId(e.target.value).catch(() => {});
            setSwitchingModel(false);
          }}
          className="field-input w-full !py-1.5 text-xs disabled:opacity-60"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-400">
          Kalau asisten sering berhenti karena error GPU, coba varian
          &ldquo;tanpa f16&rdquo;. Model baru perlu diunduh ulang.
        </p>
      </div>
    </>
  );
}

/** Isi dropdown avatar di ModuleDock. */
export function AccountPanel({ account, onNavigate }: { account: AccountInfo; onNavigate: () => void }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [returning, setReturning] = useState(false);

  async function backToOwnTenant() {
    setReturning(true);
    await fetch("/api/admin/active-tenant", { method: "DELETE" }).catch(() => {});
    setReturning(false);
    onNavigate();
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="text-left">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
          {initials(account.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{account.fullName}</p>
          <p className="truncate text-xs text-slate-500">
            <span className="badge badge-blue mr-1">{account.roleLabel}</span>
            {account.tenantName}
          </p>
        </div>
      </div>

      {account.canSwitchTenant && (
        <div className="flex gap-2 px-4 pb-3">
          <Link href="/admin/tenants" onClick={onNavigate} className="btn btn-secondary flex-1 justify-center !py-1 !text-xs">
            <Building2 size={13} />
            Ganti tenant
          </Link>
          {account.isForeignTenant && (
            <button onClick={backToOwnTenant} disabled={returning} className="btn btn-secondary flex-1 justify-center !py-1 !text-xs">
              <Undo2 size={13} />
              {returning ? "…" : "Toko sendiri"}
            </button>
          )}
        </div>
      )}

      <Section icon={Rows3} title="Tampilan">
        <DensitySetting />
      </Section>
      <Section icon={KeyRound} title="Ganti PIN">
        <ChangePinForm />
      </Section>
      <Section icon={Cpu} title="Pengaturan perangkat">
        <DeviceSettings />
      </Section>

      <div className="border-t border-slate-100 p-2">
        <button
          onClick={async () => {
            setLeaving(true);
            await logoutAndClear();
          }}
          disabled={leaving}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          <LogOut size={15} />
          {leaving ? "Keluar…" : "Keluar"}
        </button>
      </div>
    </div>
  );
}
