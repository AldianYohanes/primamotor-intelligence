import { requirePage } from "@/src/lib/auth/staff-context";
import { AppHeader } from "@/src/components/nav/AppHeader";
import { PosTerminalModule } from "@/src/modules/pos-terminal/Component";

export default async function PosPage() {
  const ctx = await requirePage("pos.use");

  return (
    <div className="bg-[#f7f8fa]">
      <AppHeader
        title="Kasir (POS)"
        subtitle={`${ctx.staff.fullName} · ${ctx.tenant.name}`}
      />
      <PosTerminalModule staffName={ctx.staff.fullName} />
    </div>
  );
}
