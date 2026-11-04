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

  const { data: unread } = await ctx.supabase.rpc("unread_notification_count", {
    p_staff_id: ctx.staff.id,
    p_business_id: ctx.tenant.id,
  });

  return (
    <>
      <AdminShell
        role={ctx.staff.role}
        staffName={ctx.staff.fullName}
        tenantName={ctx.tenant.name}
        isForeignTenant={ctx.isForeignTenant}
        unreadNotifications={unread ?? 0}
      >
        {children}
      </AdminShell>
      <AppDock />
    </>
  );
}
