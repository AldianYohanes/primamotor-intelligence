import { formatSyncAge } from "@/src/lib/stores/stock-sync-store";

/**
 * Jawaban offline yang disusun kode, bukan model. Uji M4 9 Okt 2026: barang yang
 * tidak ada di cache dijawab model "tidak tersedia di toko maupun gudang"
 * (terbaca stok nol, padahal belum bisa dicek), dan jawaban dari cache sering
 * tidak menyebut bahwa datanya mungkin tidak terbaru.
 */
type ToolTraceEntry = { name: string; result: unknown };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Hasil getStock offline yang tidak menemukan barang di cache perangkat. */
export function isOfflineNoMatch(result: unknown): boolean {
  const r = asRecord(result);
  return r.source === "offline_cache" && r.status === "no_cached_match";
}

export function offlineNoMatchReply(query: string): string {
  const name = query.trim() || "barang ini";
  return (
    `Stok ${name} belum bisa dicek: sedang offline dan barang ini tidak ada di data yang tersimpan di perangkat. ` +
    "Ini bukan berarti stoknya kosong. Coba lagi setelah tersambung."
  );
}

/**
 * Catatan untuk jawaban yang memakai hasil getStock dari cache, mis.
 * "(Data dari cache perangkat, tersinkron 5 mnt lalu.)"; null bila tidak ada.
 */
export function cacheNoteFor(toolTrace: readonly ToolTraceEntry[], now = Date.now()): string | null {
  const cached = toolTrace.filter((t) => t.name === "getStock" && asRecord(t.result).source === "offline_cache");
  if (cached.length === 0) return null;
  const synced = cached
    .map((t) => asRecord(t.result).last_synced_at)
    .filter((v): v is string => typeof v === "string")
    .sort()[0];
  return synced
    ? `(Data dari cache perangkat, tersinkron ${formatSyncAge(synced, now)}; bisa berbeda dari stok terkini.)`
    : "(Data dari cache perangkat; bisa berbeda dari stok terkini.)";
}
