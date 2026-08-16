"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  MapPin,
  Truck,
  Users,
  ClipboardList,
  ScanLine,
  BarChart3,
  History,
  Car,
  Menu,
  X,
  MessageSquare,
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Produk", icon: Package },
  { href: "/admin/locations", label: "Lokasi", icon: MapPin },
  { href: "/admin/suppliers", label: "Supplier", icon: Truck },
  { href: "/admin/staff", label: "Staf", icon: Users },
  { href: "/admin/stock-opname", label: "Stock Opname", icon: ClipboardList },
  { href: "/admin/receipt-imports", label: "Review Bon", icon: ScanLine },
  { href: "/admin/reports", label: "Laporan", icon: BarChart3 },
  { href: "/admin/audit-log", label: "Riwayat Aksi Agent", icon: History },
  { href: "/admin/car-models", label: "Model Mobil", icon: Car },
] as const;

interface Props {
  businessName?: string | null;
  staffName?: string | null;
  children: React.ReactNode;
}

export function AdminShell({ businessName, staffName, children }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-dvh bg-[#f7f8fa]">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white sm:flex">
        <SidebarContent
          businessName={businessName}
          staffName={staffName}
          isActive={isActive}
        />
      </aside>

      {/* Sidebar — mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex sm:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-50 flex w-64 flex-col bg-white shadow-popover">
            <div className="flex items-center justify-end px-3 pt-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Tutup menu"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarContent
              businessName={businessName}
              staffName={staffName}
              isActive={isActive}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar — mobile only */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Buka menu"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-slate-900">
            {businessName ?? "Prima Motor Volvo"}
          </span>
          <Link
            href="/chat"
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Buka asisten chat"
          >
            <MessageSquare size={20} />
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  businessName,
  staffName,
  isActive,
  onNavigate,
}: {
  businessName?: string | null;
  staffName?: string | null;
  isActive: (href: string, exact?: boolean) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
          PV
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {businessName ?? "Toko"}
          </p>
          <p className="truncate text-xs text-slate-500">{staffName}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {NAV.map((item) => {
          const active = isActive(item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={
                active
                  ? "flex items-center gap-2.5 rounded-md border-l-2 border-brand-600 bg-brand-50 px-2.5 py-2 text-sm font-medium text-brand-700"
                  : "flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              }
            >
              <Icon size={16} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-slate-100 px-2.5 py-3">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <MessageSquare size={16} strokeWidth={2} className="shrink-0" />
          Asisten Chat
        </Link>
        <div className="px-2.5 pt-1">
          <LogoutButton />
        </div>
      </div>
    </>
  );
}
