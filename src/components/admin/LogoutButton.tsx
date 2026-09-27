"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import clsx from "clsx";
import { logoutAndClear } from "@/src/lib/auth/logout-client";

export function LogoutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      onClick={async () => {
        setBusy(true);
        await logoutAndClear();
      }}
      disabled={busy}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-md px-0 py-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-60",
        className,
      )}
    >
      <LogOut size={16} strokeWidth={2} />
      {busy ? "Keluar…" : "Keluar"}
    </button>
  );
}
