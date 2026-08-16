import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/src/components/admin/LogoutButton";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Produk" },
  { href: "/admin/locations", label: "Lokasi" },
  { href: "/admin/suppliers", label: "Supplier" },
  { href: "/admin/staff", label: "Staf" },
  { href: "/admin/stock-opname", label: "Stock Opname" },
  { href: "/admin/receipt-imports", label: "Review Bon" },
  { href: "/admin/reports", label: "Laporan" },
  { href: "/admin/audit-log", label: "Riwayat Aksi Agent" },
  { href: "/admin/car-models", label: "Model Mobil" },
];

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
    <div className="flex min-h-dvh">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 sm:block">
        <div className="mb-6">
          {/* @ts-expect-error -- bentuk join Supabase */}
          <p className="text-sm font-semibold text-slate-900">
            {staffRow?.businesses?.name}
          </p>
          <p className="text-xs text-slate-500">{staffRow?.full_name}</p>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
