import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/src/lib/auth/staff-context";
import { ROLE_LABELS } from "@/src/lib/auth/rbac";
import { ChangePinForm } from "@/src/modules/account/ChangePinForm";

export const metadata: Metadata = {
  title: "Akun Saya — Prima Motor Volvo",
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Profil staf yang sedang login + ganti PIN sendiri. Boleh dibuka semua role
 * (kasir, owner, super admin), jadi tidak butuh izin tertentu dan tidak butuh
 * tenant aktif (super admin yang belum memilih tenant tetap bisa ganti PIN).
 */
export default async function AccountPage() {
  const ctx = await requirePage(null, { requireTenant: false });
  const { staff, ownBusiness } = ctx;

  const rows: [string, string][] = [
    ["Nama", staff.fullName],
    ["Username", staff.username],
    ["Peran", ROLE_LABELS[staff.role]],
    ["Toko", ownBusiness.name],
  ];

  return (
    <main className="flex min-h-dvh justify-center bg-[#f7f8fa] px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div>
          <Link href="/menu" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            <ArrowLeft size={14} />
            Menu
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Akun Saya</h1>
        </div>

        <section className="card p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-semibold text-white">
              {initials(staff.fullName)}
            </span>
            <p className="min-w-0 truncate text-base font-semibold text-slate-900">{staff.fullName}</p>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">{label}</dt>
                <dd className="min-w-0 truncate font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Ganti PIN</h2>
          <ChangePinForm />
        </section>
      </div>
    </main>
  );
}
