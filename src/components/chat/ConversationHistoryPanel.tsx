"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { History, MessageSquare, X } from "lucide-react";
import type { ConversationSummary } from "@/src/lib/agents/conversation";

interface Props {
  currentConversationId: string | null;
  load: () => Promise<ConversationSummary[]>;
  onSelect: (conversationId: string) => void;
  onClose: () => void;
  /** Sedang membuka percakapan yang dipilih. */
  busy: boolean;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `Hari ini, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Kemarin, ${time}`;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/**
 * Panel "Riwayat" di Asisten Stok: daftar percakapan staf sebelumnya. Memilih
 * salah satu membuka percakapan itu dan pesan berikutnya melanjutkannya — model
 * hanya menerima potongan riwayat terbaru (lihat history-window.ts).
 */
export function ConversationHistoryPanel({
  currentConversationId,
  load,
  onSelect,
  onClose,
  busy,
}: Props) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((list) => !cancelled && setItems(list))
      .catch((err) => {
        console.error("Gagal memuat riwayat percakapan:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-label="Riwayat percakapan"
        className="flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-popover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <History size={15} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Riwayat Percakapan</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items === null && !failed && (
            <p className="p-6 text-center text-sm text-slate-400">Memuat riwayat…</p>
          )}
          {failed && (
            <p className="p-6 text-center text-sm text-red-600">
              Gagal memuat riwayat. Periksa koneksi lalu coba lagi.
            </p>
          )}
          {items?.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">
              Belum ada percakapan sebelumnya.
            </p>
          )}
          {items && items.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {items.map((c) => {
                const current = c.id === currentConversationId;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => !current && onSelect(c.id)}
                      disabled={busy || current}
                      className={clsx(
                        "flex w-full items-start gap-2.5 px-4 py-3 text-left disabled:cursor-default",
                        current ? "bg-brand-50/60" : "hover:bg-slate-50 disabled:opacity-60",
                      )}
                    >
                      <MessageSquare size={14} className="mt-0.5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">{c.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {formatWhen(c.lastActivityAt)} · {c.messageCount} pesan
                        </p>
                      </div>
                      {current && (
                        <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                          Dibuka
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400">
          Percakapan yang dilanjutkan tetap tampil utuh, tapi asisten hanya
          mengingat beberapa pesan terakhir.
        </p>
      </aside>
    </div>
  );
}
