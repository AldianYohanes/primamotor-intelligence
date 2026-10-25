import type { Observation } from "@/src/lib/eval/types";

export type ServerCheck = { ok: true } | { ok: false; reason: string };

/** Berapa eksekusi berturut-turut yang boleh jatuh ke cache sebelum run dihentikan. */
export const MAX_CONSECUTIVE_SERVER_FALLBACKS = 3;

/**
 * Cek awal sebelum run: satu pencarian stok sungguhan ke server. Run 23 Okt 2026
 * berjalan 4,5 jam padahal pencarian produk gagal sejak skenario pertama, jadi semua
 * jawaban stok datang dari cache lama dan angka ETSR-nya tidak bisa dipakai.
 */
export async function checkAgentServer(fetchFn: typeof fetch = fetch): Promise<ServerCheck> {
  try {
    const res = await fetchFn("/api/agent/tools/get-stock?query=radiator&limit=1");
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      return { ok: false, reason: `HTTP ${res.status}${typeof body?.error === "string" ? `: ${body.error}` : ""}` };
    }
    const body = (await res.json().catch(() => null)) as { results?: unknown } | null;
    if (!Array.isArray(body?.results)) return { ok: false, reason: "Respons get-stock bukan hasil pencarian" };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Giliran ini memakai cache perangkat, atau pencarian produknya gagal karena server.
 * Eksekusi seperti itu tidak menguji model, jadi ditandai di ekspor.
 */
export function hasServerFallback(toolTrace: Observation["toolTrace"]): boolean {
  return toolTrace.some((entry) => {
    const result = entry.result as { source?: unknown; status?: unknown } | null | undefined;
    return result?.source === "offline_cache" || result?.status === "product_search_failed";
  });
}
