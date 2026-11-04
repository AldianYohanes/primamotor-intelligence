import type { ReactNode } from "react";
import { PublicShell } from "./PublicShell";

export const CONTACT_EMAIL = "aldianyhs@gmail.com";
export const LAST_UPDATED = "27 Oktober 2026";

/** Kerangka halaman informasi publik (Tentang, Privasi, Syarat): terbuka tanpa login, memakai header dan footer publik yang sama. */
export function InfoShell({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <PublicShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {updated && <p className="mt-1 text-sm text-slate-600">Terakhir diperbarui {updated}</p>}
        <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-700">{children}</div>
      </main>
    </PublicShell>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
