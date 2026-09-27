"use client";

import { Menu } from "lucide-react";

interface Props {
  businessName?: string | null;
  onOpenMenu: () => void;
}

/**
 * Topbar mobile-only — tidak dirender di desktop (sidebar sudah selalu
 * terlihat di `sm:` ke atas, lihat AdminShell.tsx). Diekstrak dari
 * AdminShell.tsx (§15.4) supaya konsisten dengan komponen lain di
 * `components/admin/` yang masing-masing satu tanggung jawab.
 */
export function AdminHeader({ businessName, onOpenMenu }: Props) {
  return (
    <header className="pr-dock flex min-h-[52px] items-center gap-2 border-b border-slate-200 bg-white py-2 pl-3 sm:hidden">
      <button
        onClick={onOpenMenu}
        className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        aria-label="Buka menu"
      >
        <Menu size={20} />
      </button>
      <span className="truncate text-sm font-semibold text-slate-900">
        {businessName ?? "Prima Motor Volvo"}
      </span>
    </header>
  );
}
