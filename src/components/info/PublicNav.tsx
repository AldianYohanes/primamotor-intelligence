"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/** Navigasi header halaman publik; halaman yang sedang dibuka ditandai. */
export function PublicNav({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      className={clsx(
        "rounded-full px-3 py-1.5 text-xs font-medium no-underline",
        pathname === href ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Utama" className="flex items-center gap-1">
      {link("/about", "Tentang")}
      {loggedIn ? (
        <Link href="/menu" className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background no-underline">
          Buka Aplikasi
        </Link>
      ) : (
        <>
          {link("/login", "Masuk")}
          <Link
            href="/signup"
            aria-current={pathname === "/signup" ? "page" : undefined}
            className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background no-underline"
          >
            Daftar
          </Link>
        </>
      )}
    </nav>
  );
}
