import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/src/lib/supabase/server";
import { PublicNav } from "./PublicNav";

const LINKS = [
  { href: "/about", label: "Tentang" },
  { href: "/privacy", label: "Kebijakan Privasi" },
  { href: "/terms", label: "Syarat Penggunaan" },
];

/**
 * Kerangka satu-satunya untuk halaman publik (beranda, masuk, daftar, tentang, privasi, syarat):
 * header dan footer sama di semua halaman, dengan tautan saling terhubung.
 * Isi halaman diatur pemanggil lewat `children` (mengisi sisa tinggi layar).
 */
export async function PublicShell({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-dvh flex-col bg-[#f7f8fa]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold text-slate-900 no-underline">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
              PV
            </span>
            Prima Motor Volvo
          </Link>
          <PublicNav loggedIn={!!user} />
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-4 text-xs text-slate-600">
          <nav aria-label="Informasi" className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/" className="text-slate-700 underline">
              Beranda
            </Link>
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-slate-700 underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <span>Lantai 3A, Blok M Square, Jakarta Selatan</span>
        </div>
      </footer>
    </div>
  );
}
