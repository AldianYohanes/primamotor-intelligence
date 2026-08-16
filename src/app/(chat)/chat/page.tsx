import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatWindow } from "@/src/components/chat/ChatWindow";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, full_name, username, business_id, businesses(slug)")
    .eq("auth_user_id", user.id)
    .single();

  if (!staffRow) redirect("/login");

  // @ts-expect-error -- bentuk join Supabase, businesses adalah objek tunggal (many-to-one)
  const businessSlug: string = staffRow.businesses.slug;

  return (
    <ChatWindow
      businessId={staffRow.business_id}
      businessSlug={businessSlug}
      staffId={staffRow.id}
      username={staffRow.username}
      fullName={staffRow.full_name}
    />
  );
}
