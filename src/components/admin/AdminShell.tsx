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
  X,
  Receipt,
  Wallet,
  Clock,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { can, type Role } from "@/src/lib/auth/rbac";
import { AdminHeader } from "./AdminHeader";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Produk", icon: Package },
  { href: "/admin/locations", label: "Lokasi", icon: MapPin },
  { href: "/admin/suppliers", label: "Supplier", icon: Truck },
  { href: "/admin/staff", label: "Staf", icon: Users },
  { href: "/admin/stock-opname", label: "Stock Opname", icon: ClipboardList },
  { href: "/admin/pos/sales", label: "Riwayat Penjualan", icon: Receipt },
  { href: "/admin/pos/shifts", label: "Riwayat Shift Kasir", icon: Clock },
  { href: "/admin/pos/customers", label: "Pelanggan Piutang", icon: Wallet },
  { href: "/admin/receipt-imports", label: "Review Bon", icon: ScanLine },
  { href: "/admin/reports", label: "Laporan", icon: BarChart3 },
  { href: "/admin/audit-log", label: "Riwayat Aksi Agent", icon: History },
  { href: "/admin/car-models", label: "Model Mobil", icon: Car },
] as const;

const TENANTS_PATH = "/admin/tenants";

interface Props {
  role: Role;
  staffName?: string | null;
  tenantName: string;
  /** Super admin sedang bekerja di tenant yang bukan miliknya. */
  isForeignTenant: boolean;
  children: React.ReactNode;
}

export function AdminShell({ role, staffName, tenantName, isForeignTenant, children }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const canSwitchTenant = can(role, "tenant.switch");
  const businessName = tenantName;

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
          canSwitchTenant={canSwitchTenant}
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
              canSwitchTenant={canSwitchTenant}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader businessName={businessName} onOpenMenu={() => setMobileOpen(true)} />
        {/* Bar atas desktop: tempat ModuleDock (fixed kanan atas) supaya tidak menimpa tombol aksi halaman. */}
        <div className="pr-dock hidden h-[52px] shrink-0 items-center border-b border-slate-200 bg-white pl-8 sm:flex">
          <p className="truncate text-sm text-slate-500">
            Portal Admin · <span className="font-medium text-slate-900">{businessName}</span>
          </p>
        </div>

        {isForeignTenant && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 sm:px-8">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">
              Anda sedang mengelola <b>{tenantName}</b> sebagai super admin. Setiap perubahan
              tercatat atas nama Anda.
            </span>
            <Link href={TENANTS_PATH} className="shrink-0 font-medium underline">
              Ganti tenant
            </Link>
          </div>
        )}

        <main className="page-pad flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  businessName,
  staffName,
  isActive,
  canSwitchTenant,
  onNavigate,
}: {
  businessName?: string | null;
  staffName?: string | null;
  isActive: (href: string, exact?: boolean) => boolean;
  canSwitchTenant: boolean;
  onNavigate?: () => void;
}) {
  const nav = canSwitchTenant
    ? [{ href: TENANTS_PATH, label: "Tenant", icon: Building2, exact: false }, ...NAV]
    : NAV;
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
        {nav.map((item) => {
          const active = isActive(item.href, "exact" in item ? item.exact : false);
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

    </>
  );
}
