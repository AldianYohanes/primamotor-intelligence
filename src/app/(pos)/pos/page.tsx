import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PosTerminalModule } from "@/src/modules/pos-terminal/Component";

export default async function PosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, full_name")
    .eq("auth_user_id", user.id)
    .single();

  if (!staffRow) redirect("/login");

  return <PosTerminalModule staffName={staffRow.full_name} />;
}
