/**
 * Pembatas laju jendela geser di memori proses, untuk route publik (login, daftar).
 * shortcut: hitungan per instance server, jadi di serverless batasnya longgar per instance;
 * naikkan ke tabel Supabase seperti ocr-rate-limit.ts bila abuse nyata muncul.
 */
const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value as string);
  return false;
}

/** IP klien dari header proxy; "unknown" bila tidak ada (semua permintaan tanpa IP berbagi satu jatah). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
