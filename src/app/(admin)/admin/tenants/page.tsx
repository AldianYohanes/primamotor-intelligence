import { requirePage } from "@/src/lib/auth/staff-context";
import { TenantApprovalList } from "@/src/components/admin/TenantApprovalList";
import { TenantPicker } from "./TenantPicker";

export default async function TenantsPage() {
  const ctx = await requirePage("tenant.switch", { requireTenant: false });

  const { data: tenants } = await ctx.supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("status", "active")
    .order("name", { ascending: true });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Tenant</h1>
        <p className="text-sm text-slate-500">
          Pilih toko yang akan dikelola. Semua halaman portal, chat, dan kasir memakai tenant aktif ini,
          dan setiap peralihan dicatat.
        </p>
      </div>

      <TenantApprovalList />

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Tenant aktif</h2>
        <TenantPicker
          tenants={tenants ?? []}
          activeId={ctx.tenant?.id ?? null}
          ownId={ctx.ownBusiness.id}
        />
      </section>
    </div>
  );
}
