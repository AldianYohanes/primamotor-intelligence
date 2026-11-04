"use client";

import { useTransition } from "react";
import { markAllNotificationsRead } from "@/src/app/(app)/notifications/actions";

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => start(() => markAllNotificationsRead())}
      className="text-xs font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
    >
      {pending ? "Menandai…" : "Tandai semua dibaca"}
    </button>
  );
}
