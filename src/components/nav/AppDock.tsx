import { getStaffContext } from "@/src/lib/auth/staff-context";
import { can, modulesFor, ROLE_LABELS } from "@/src/lib/auth/rbac";
import { EVAL_TENANT_SLUG } from "@/src/lib/eval/tenant";
import { ModuleDock } from "./ModuleDock";

/**
 * Versi server dari dock: membaca konteks staf (di-cache per request, jadi
 * tidak menambah query kalau halaman sudah memanggil requirePage) lalu
 * merender ModuleDock. Dipasang di layout setiap modul ber-login.
 */
export async function AppDock() {
  const result = await getStaffContext();
  if (!result.ok || !result.ctx.tenant) return null;
  const { staff, tenant, isForeignTenant } = result.ctx;

  const evalAvailable = process.env.ENABLE_EVAL_PAGE === "true" && tenant.slug === EVAL_TENANT_SLUG;

  return (
    <ModuleDock
      modules={modulesFor(staff.role, { evalAvailable })}
      account={{
        fullName: staff.fullName,
        roleLabel: ROLE_LABELS[staff.role],
        tenantName: tenant.name,
        isForeignTenant,
        canSwitchTenant: can(staff.role, "tenant.switch"),
      }}
    />
  );
}
