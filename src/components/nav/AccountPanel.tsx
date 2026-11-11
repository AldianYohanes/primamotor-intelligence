"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Bell,
  Building2,
  ChevronDown,
  KeyRound,
  LogOut,
  Rows3,
  Settings,
  Undo2,
  UserRound,
} from "lucide-react";
import { DensitySetting } from "@/src/components/settings/DensitySetting";
import { ThemeSetting } from "@/src/components/settings/ThemeSetting";
import { logoutAndClear } from "@/src/lib/auth/logout-client";
import { ChangePinForm } from "@/src/modules/account/ChangePinForm";

export interface AccountInfo {
  fullName: string;
  roleLabel: string;
  tenantName: string;
  isForeignTenant: boolean;
  canSwitchTenant: boolean;
  /** Jumlah notifikasi yang belum dibaca staf ini. */
  unreadNotifications?: number;
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

      <Link
        href="/account"
        onClick={onNavigate}
        className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        <UserRound size={15} className="shrink-0 text-slate-500" />
        Akun saya
      </Link>
      <Link
        href="/notifications"
        onClick={onNavigate}
        className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        <Bell size={15} className="shrink-0 text-slate-500" />
        Notifikasi
        {(account.unreadNotifications ?? 0) > 0 && (
          <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold leading-5 text-white">
            {account.unreadNotifications}
          </span>
        )}
      </Link>
      <Section icon={Rows3} title="Tampilan">
        <ThemeSetting />
        <DensitySetting />
      </Section>
      <Section icon={KeyRound} title="Ganti PIN">
        <ChangePinForm compact />
      </Section>
      <Link
        href="/settings"
        onClick={onNavigate}
        className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        <Settings size={15} className="shrink-0 text-slate-500" />
        Pengaturan
        <span className="ml-auto text-xs text-slate-400">Perangkat, model AI</span>
      </Link>

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
