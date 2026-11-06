import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronRight, KeyRound } from "lucide-react";
import { requirePage } from "@/src/lib/auth/staff-context";
import { DensitySetting } from "@/src/components/settings/DensitySetting";
import { DeviceSettings } from "@/src/components/settings/DeviceSettings";
import { ThemeSetting } from "@/src/components/settings/ThemeSetting";

export const metadata: Metadata = {
  title: "Pengaturan — Prima Motor Volvo",
};

/**
 * Pengaturan per perangkat: tema, kerapatan, notifikasi, pasang aplikasi, dan model AI.
 * Semua disimpan di perangkat ini (bukan di akun), jadi boleh dibuka semua role.
 */
export default async function SettingsPage() {
  await requirePage(null, { requireTenant: false });

  return (
    <main className="flex min-h-dvh justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div>
          <Link href="/menu" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            <ArrowLeft size={14} />
            Menu
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Pengaturan</h1>
        </div>

        <section className="card space-y-4 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Tampilan</h2>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Tema</p>
            <ThemeSetting />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Kerapatan</p>
            <DensitySetting />
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Perangkat ini</h2>
          <DeviceSettings />
        </section>

        <Link href="/account" className="card flex items-center gap-3 p-4 no-underline transition-colors hover:border-brand-300">
          <KeyRound size={16} className="shrink-0 text-slate-500" />
          <span className="flex-1 text-sm text-slate-700">Akun dan ganti PIN</span>
          <ChevronRight size={16} className="shrink-0 text-slate-400" />
        </Link>
      </div>
    </main>
  );
}
