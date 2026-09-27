import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, FlaskConical, LayoutDashboard, MessageSquare, ShoppingCart } from "lucide-react";
import { EVAL_TENANT_SLUG } from "@/src/lib/eval/tenant";
import { requirePage } from "@/src/lib/auth/staff-context";
import { modulesFor, ROLE_LABELS, type ModuleKey } from "@/src/lib/auth/rbac";

export const metadata: Metadata = {
  title: "Menu — Prima Motor Volvo",
};

const ICONS: Record<ModuleKey, typeof MessageSquare> = {
  chat: MessageSquare,
  pos: ShoppingCart,
  portal: LayoutDashboard,
  eval: FlaskConical,
  tenants: Building2,
};

/**
 * Halaman pertama setelah login: hanya modul yang boleh dibuka role ini yang
 * tampil (kasir: Chat & POS; owner: + Portal Admin; super admin: + Tenant).
 */
export default async function MenuPage() {
  const ctx = await requirePage(null);
  const modules = modulesFor(ctx.staff.role, {
    evalAvailable: process.env.ENABLE_EVAL_PAGE === "true" && ctx.tenant.slug === EVAL_TENANT_SLUG,
  });

  return (
    <main className="flex min-h-dvh items-start justify-center bg-[#f7f8fa] px-4 py-10 sm:items-center">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            PV
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">
              {ctx.tenant.name}
            </p>
            <p className="truncate text-xs text-slate-500">
              {ctx.staff.fullName} · {ROLE_LABELS[ctx.staff.role]}
            </p>
          </div>
        </div>

        <nav className="space-y-2" aria-label="Pilih modul">
          {modules.map((m) => {
            const Icon = ICONS[m.key];
            return (
              <Link
                key={m.key}
                href={m.href}
                className="card flex items-center gap-3 p-4 no-underline transition-colors hover:border-brand-300"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{m.label}</span>
                  <span className="block text-xs text-slate-500">{m.description}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-400" />
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}
