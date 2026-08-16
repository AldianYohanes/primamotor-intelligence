import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/src/components/admin/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: staffRow } = await supabase
    .from("staff")
    .select("full_name, role, businesses(name)")
    .eq("auth_user_id", user.id)
    .single();

  return (
    <AdminShell
      // @ts-expect-error -- bentuk join Supabase
      businessName={staffRow?.businesses?.name}
      staffName={staffRow?.full_name}
    >
      {children}
    </AdminShell>
  );
}
