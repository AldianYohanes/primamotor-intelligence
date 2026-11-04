"use client";

import Link from "next/link";
import { useTransition } from "react";
import { markNotificationRead } from "@/src/app/(app)/notifications/actions";

/**
 * Satu baris notifikasi. Mengetuk baris menandainya sudah dibaca (lalu membuka
 * tujuannya bila ada). Yang belum dibaca diberi titik biru dan judul tebal.
 */
export function NotificationRow({
  id,
  href,
  unread,
  children,
}: {
  id: string;
  href: string | null;
  unread: boolean;
  children: React.ReactNode;
}) {
  const [, start] = useTransition();
  const mark = () => {
    if (unread) start(() => markNotificationRead(id));
  };
  const cls = "relative block p-4 pl-7 hover:bg-slate-50 " + (unread ? "bg-brand-50/40" : "");
  const dot = unread ? (
    <span aria-label="Belum dibaca" className="absolute left-3 top-5 h-2 w-2 rounded-full bg-brand-600" />
  ) : null;
  if (href) {
    return (
      <Link href={href} onClick={mark} className={cls}>
        {dot}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={mark} className={cls + " w-full text-left"} disabled={!unread}>
      {dot}
      {children}
    </button>
  );
}
