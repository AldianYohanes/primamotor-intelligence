import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bell } from "lucide-react";
import { requirePage } from "@/src/lib/auth/staff-context";
import { can } from "@/src/lib/auth/rbac";
import {
  isNotificationType,
  notificationHref,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
} from "@/src/modules/notifications/utils";

export const metadata: Metadata = {
  title: "Notifikasi — Prima Motor Volvo",
};

const PAGE_SIZE = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Pusat notifikasi: peringatan yang ditulis Monitoring Agent ke tabel
 * `notifications` (stok menipis, saran belanja ulang), yang sama dengan isi
 * push notification. Notifikasi tanpa staf tujuan (staff_id kosong) berlaku
 * untuk semua staf toko; sisanya hanya untuk staf yang bersangkutan.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const { type: typeParam, page: pageParam } = await searchParams;
  const type = isNotificationType(typeParam) ? typeParam : null;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const { supabase, tenant, staff } = await requirePage(null);
  const canOpenPortal = can(staff.role, "portal.access");

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, related_id, created_at", { count: "exact" })
    .eq("business_id", tenant.id)
    .or(`staff_id.is.null,staff_id.eq.${staff.id}`)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (type) query = query.eq("type", type);

  const { data, count, error } = await query;
  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const href = (next: { type?: string | null; page?: number }) => {
    const sp = new URLSearchParams();
    const t = next.type === undefined ? type : next.type;
    if (t) sp.set("type", t);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    return qs ? `/notifications?${qs}` : "/notifications";
  };

  const chip = (active: boolean) =>
    active
      ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
      : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50";

  return (
    <main className="flex min-h-dvh justify-center bg-[#f7f8fa] px-4 py-10">
      <div className="w-full max-w-2xl space-y-4">
        <div>
          <Link
            href={canOpenPortal ? "/admin" : "/menu"}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
          >
            <ArrowLeft size={14} />
            {canOpenPortal ? "Dashboard" : "Menu"}
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Notifikasi</h1>
          <p className="text-sm text-slate-500">Peringatan stok menipis dan saran belanja dari Monitoring Agent.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={href({ type: null })} className={chip(!type)}>
            Semua
          </Link>
          {NOTIFICATION_TYPES.map((t) => (
            <Link key={t} href={href({ type: t })} className={chip(type === t)}>
              {NOTIFICATION_TYPE_LABELS[t]}
            </Link>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Gagal memuat notifikasi: {error.message}
          </p>
        )}

        <div className="card divide-y divide-slate-100">
          {items.length === 0 && !error && (
            <p className="flex items-center gap-2 p-4 text-sm text-slate-400">
              <Bell size={15} />
              Belum ada notifikasi.
            </p>
          )}
          {items.map((n) => {
            const target = notificationHref(n.type, n.related_id, canOpenPortal);
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{n.title}</p>
                  <span className="badge badge-blue shrink-0">{NOTIFICATION_TYPE_LABELS[n.type]}</span>
                </div>
                {n.body && <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>}
                <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.created_at)}</p>
              </>
            );
            return target ? (
              <Link key={n.id} href={target} className="block p-4 hover:bg-slate-50">
                {body}
              </Link>
            ) : (
              <div key={n.id} className="p-4">
                {body}
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Halaman {page} / {totalPages}
            </span>
            <div className="flex gap-3">
              {page > 1 && (
                <Link href={href({ page: page - 1 })} className="font-medium text-brand-600 hover:text-brand-700">
                  Sebelumnya
                </Link>
              )}
              {page < totalPages && (
                <Link href={href({ page: page + 1 })} className="font-medium text-brand-600 hover:text-brand-700">
                  Berikutnya
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
