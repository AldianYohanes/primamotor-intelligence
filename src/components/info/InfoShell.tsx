import Link from "next/link";
import type { ReactNode } from "react";

export const CONTACT_EMAIL = "aldianyhs@gmail.com";
export const LAST_UPDATED = "27 Oktober 2026";

const LINKS = [
  { href: "/about", label: "Tentang" },
  { href: "/privacy", label: "Kebijakan Privasi" },
  { href: "/terms", label: "Syarat Penggunaan" },
];

/** Kerangka halaman informasi publik (Tentang, Privasi, Syarat): terbuka tanpa login. */
export function InfoShell({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f8fa]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-sm font-bold text-slate-900 no-underline">
            Prima Motor Volvo
          </Link>
          <Link href="/login" className="text-xs font-medium text-slate-700 underline">
            Masuk
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {updated && <p className="mt-1 text-sm text-slate-600">Terakhir diperbarui {updated}</p>}
        <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-700">{children}</div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <nav aria-label="Informasi" className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-1 px-4 py-4 text-xs">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-slate-700 underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
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
