import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  /** Aksi khusus halaman, mis. "Percakapan Baru" di chat. */
  actions?: ReactNode;
}

/**
 * Header halaman kerja (chat & POS). Navigasi antar modul dan akun ada di
 * ModuleDock (kanan atas); header ini hanya judul + aksi halaman dan
 * menyisakan ruang selebar dock lewat .pr-dock.
 */
export function AppHeader({ title, subtitle, actions }: Props) {
  return (
    <header className="pr-dock flex min-h-[52px] items-center justify-between gap-2 border-b border-slate-200 bg-white py-2 pl-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}
