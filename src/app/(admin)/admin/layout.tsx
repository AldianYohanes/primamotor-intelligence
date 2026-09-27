import { requirePage } from "@/src/lib/auth/staff-context";
import { AdminShell } from "@/src/components/admin/AdminShell";
import { AppDock } from "@/src/components/nav/AppDock";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Kasir (role staff) tidak punya akses Portal Admin (naskah bab 3) dan
  // diarahkan ke menu.
  const ctx = await requirePage("portal.access");

  return (
    <>
      <AdminShell
        role={ctx.staff.role}
        staffName={ctx.staff.fullName}
        tenantName={ctx.tenant.name}
        isForeignTenant={ctx.isForeignTenant}
      >
        {children}
      </AdminShell>
      <AppDock />
    </>
  );
}
