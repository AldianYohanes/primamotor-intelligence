"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  ChevronDown,
  Cog,
  GitBranch,
  Loader2,
  MessageSquare,
  RotateCcw,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ProcessStep } from "@/src/lib/agents/orchestrator";

const KIND_ICON: Record<ProcessStep["kind"], LucideIcon> = {
  route: GitBranch,
  tool: Wrench,
  action: Cog,
  retry: RotateCcw,
  answer: MessageSquare,
};

export function ProcessTimeline({ steps }: { steps: ProcessStep[] }) {
  return (
    <ol className="space-y-2 border-l border-slate-200 pl-3">
      {steps.map((step, i) => {
        const Icon = step.status === "running" ? Loader2 : KIND_ICON[step.kind];
        return (
          <li key={i} className="flex gap-2">
            <Icon
              size={13}
              className={clsx(
                "mt-0.5 shrink-0",
                step.status === "running" && "animate-spin text-brand-600",
                step.status === "failed" && "text-red-500",
                step.status === "done" && "text-slate-400",
              )}
            />
            <div className="min-w-0">
              <p className={clsx("text-xs", step.status === "failed" ? "text-red-700" : "text-slate-700")}>
                {step.label}
              </p>
              {step.detail && (
                <p className="mt-0.5 break-words font-mono text-[11px] leading-snug text-slate-500">
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Tombol "Lihat proses" di bawah jawaban asisten, tertutup secara default.
 * Dipakai juga saat asisten masih bekerja (live) dengan daftar langkah yang terus bertambah.
 */
export function ProcessDetails({ steps, live = false }: { steps: ProcessStep[]; live?: boolean }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  return (
    <div className="mt-1 max-w-[80%]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 px-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
      >
        {open ? "Sembunyikan proses" : "Lihat proses"}
        <span className="text-slate-400">({steps.length} langkah{live ? ", berjalan" : ""})</span>
        <ChevronDown size={12} className={clsx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2.5">
          <ProcessTimeline steps={steps} />
        </div>
      )}
    </div>
  );
}
