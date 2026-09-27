"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LogIn } from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export function TenantPicker({
  tenants,
  activeId,
  ownId,
}: {
  tenants: Tenant[];
  activeId: string | null;
  ownId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enter(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch("/api/admin/active-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: id }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Gagal memilih tenant");
      setBusyId(null);
      return;
    }
    // Refresh penuh data server (layout membaca cookie tenant aktif).
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="card divide-y divide-slate-100">
        {tenants.length === 0 && <p className="p-4 text-sm text-slate-400">Belum ada tenant aktif.</p>}
        {tenants.map((t) => {
          const active = t.id === activeId;
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {t.name}
                  {t.id === ownId && <span className="badge badge-slate ml-2">Tenant Anda</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{t.slug}</p>
              </div>
              {active ? (
                <span className="badge badge-emerald">
                  <Check size={12} /> Aktif
                </span>
              ) : (
                <button
                  onClick={() => enter(t.id)}
                  disabled={busyId !== null}
                  className="btn btn-secondary !px-3 !py-1 !text-xs"
                >
                  <LogIn size={13} />
                  {busyId === t.id ? "Masuk…" : "Masuk"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
