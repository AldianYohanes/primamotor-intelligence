import Link from "next/link";
import { ArrowRight, Bell, PackageSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TenantApprovalList } from "@/src/components/admin/TenantApprovalList";

const NOTIF_PAGE_SIZE = 10;

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notifPage?: string }>;
}) {
  const { notifPage: notifPageParam } = await searchParams;
  const notifPage = Math.max(1, Number(notifPageParam) || 1);
  const from = (notifPage - 1) * NOTIF_PAGE_SIZE;
  const to = from + NOTIF_PAGE_SIZE - 1;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: staffRow } = await supabase
    .from("staff")
    .select("role")
    .eq("auth_user_id", user!.id)
    .single();

  const [{ data: suggestions }, { data: notifications, count: notifCount }] =
    await Promise.all([
      supabase
        .from("reorder_suggestions")
        .select("*, products(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to),
    ]);

  const totalNotifPages = Math.max(
    1,
    Math.ceil((notifCount ?? 0) / NOTIF_PAGE_SIZE),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Ringkasan kondisi toko hari ini
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          icon={PackageSearch}
          label="Saran Restock Menunggu"
          value={suggestions?.length ?? 0}
          href="/admin/audit-log"
          tone="amber"
        />
        <StatCard
          icon={Bell}
          label="Notifikasi"
          value={notifCount ?? 0}
          tone="blue"
        />
      </div>

      {staffRow?.role === "admin" && <TenantApprovalList />}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            Saran Restock ({suggestions?.length ?? 0})
          </h2>
          <Link
            href="/admin/audit-log"
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Lihat riwayat lengkap
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="card mt-2 divide-y divide-slate-100">
          {(suggestions ?? []).length === 0 && (
            <p className="p-4 text-sm text-slate-400">
              Tidak ada saran restock saat ini.
            </p>
          )}
          {(suggestions ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4">
              <div>
                {/* @ts-expect-error -- bentuk join Supabase */}
                <p className="text-sm font-medium text-slate-900">
                  {s.products?.name}
                </p>
                <p className="text-xs text-slate-500">{s.reason}</p>
              </div>
              <span className="badge badge-amber">
                +{s.suggested_quantity} unit
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            Notifikasi ({notifCount ?? 0})
          </h2>
          {totalNotifPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>
                Halaman {notifPage} / {totalNotifPages}
              </span>
              <Link
                aria-disabled={notifPage <= 1}
                href={`/admin?notifPage=${notifPage - 1}`}
                className={
                  notifPage <= 1
                    ? "pointer-events-none text-slate-300"
                    : "font-medium text-brand-600 hover:text-brand-700"
                }
              >
                Sebelumnya
              </Link>
              <Link
                aria-disabled={notifPage >= totalNotifPages}
                href={`/admin?notifPage=${notifPage + 1}`}
                className={
                  notifPage >= totalNotifPages
                    ? "pointer-events-none text-slate-300"
                    : "font-medium text-brand-600 hover:text-brand-700"
                }
              >
                Berikutnya
              </Link>
            </div>
          )}
        </div>
        <div className="card mt-2 divide-y divide-slate-100">
          {(notifications ?? []).length === 0 && (
            <p className="p-4 text-sm text-slate-400">Belum ada notifikasi.</p>
          )}
          {(notifications ?? []).map((n) => (
            <div key={n.id} className="p-4">
              <p className="text-sm font-medium text-slate-900">{n.title}</p>
              <p className="text-xs text-slate-500">{n.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: number;
  href?: string;
  tone: "amber" | "blue";
}) {
  const iconTone =
    tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600";

  const content = (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
        <Icon size={19} strokeWidth={2} />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="transition-transform hover:-translate-y-0.5">
      {content}
    </Link>
  );
}
