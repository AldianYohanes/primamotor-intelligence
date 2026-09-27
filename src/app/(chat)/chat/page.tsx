import { requirePage } from "@/src/lib/auth/staff-context";
import { modulesFor } from "@/src/lib/auth/rbac";
import { ChatWindow } from "@/src/components/chat/ChatWindow";

export default async function ChatPage() {
  const ctx = await requirePage("chat.use");

  return (
    <ChatWindow
      businessId={ctx.tenant.id}
      tenantName={ctx.tenant.name}
      // PIN konfirmasi diverifikasi terhadap akun di tenant tempat staf terdaftar.
      businessSlug={ctx.ownBusiness.slug}
      staffId={ctx.staff.id}
      username={ctx.staff.username}
      fullName={ctx.staff.fullName}
      modules={modulesFor(ctx.staff.role)}
    />
  );
}
