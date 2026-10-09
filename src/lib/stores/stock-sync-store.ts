import { create } from "zustand";
import type { createClient } from "@/src/lib/supabase/client";
import { getLastStockSync, syncStockCache } from "@/src/lib/cache/indexeddb";

export type StockSyncStatus = "idle" | "syncing" | "ok" | "error";

interface StockSyncState {
  status: StockSyncStatus;
  /** ISO, waktu sinkron terakhir yang berhasil (dari cache perangkat). */
  lastSyncedAt: string | null;
  error: string | null;
  /** Baca waktu sinkron terakhir dari IndexedDB (mis. saat /chat dibuka offline). */
  load: (businessId: string) => Promise<void>;
  /** Sinkron ulang cache stok; panggilan bersamaan digabung jadi satu. */
  sync: (supabase: ReturnType<typeof createClient>, businessId: string) => Promise<void>;
}

let inFlight: Promise<void> | null = null;

/**
 * Status sinkron cache stok offline (IndexedDB) untuk indikator di header /chat:
 * kapan terakhir sinkron, sedang sinkron, atau gagal.
 */
export const useStockSyncStore = create<StockSyncState>((set) => ({
  status: "idle",
  lastSyncedAt: null,
  error: null,
  load: async (businessId) => {
    const last = await getLastStockSync(businessId).catch(() => null);
    set((s) => ({ lastSyncedAt: s.lastSyncedAt ?? last }));
  },
  sync: (supabase, businessId) => {
    inFlight ??= (async () => {
      set({ status: "syncing", error: null });
      try {
        const result = await syncStockCache(supabase, businessId);
        if (result.ok) set({ status: "ok", lastSyncedAt: result.syncedAt });
        else set({ status: "error", error: result.error });
      } catch (err) {
        set({ status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  },
}));

/** "baru saja", "5 mnt lalu", "2 jam lalu", atau jam:menit untuk yang lebih lama. */
export function formatSyncAge(iso: string | null, now = Date.now()): string {
  if (!iso) return "belum pernah";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "belum pernah";
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} mnt lalu`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} jam lalu`;
  return new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
