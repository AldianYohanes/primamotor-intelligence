import 'server-only'
import type { createClient } from '@/lib/supabase/server'

// Default 20 upload bon per jam per toko — cukup longgar untuk pemakaian wajar
// (toko kecil, bukan retail besar-besar), tapi mencegah biaya Gemini API
// membengkak kalau ada bug retry-loop di client atau penyalahgunaan.
// Override lewat env kalau kebutuhan tenant tertentu beda, tanpa deploy ulang.
const DEFAULT_MAX_REQUESTS = Number(process.env.OCR_RATE_LIMIT_MAX ?? 20)
const DEFAULT_WINDOW_MINUTES = Number(process.env.OCR_RATE_LIMIT_WINDOW_MINUTES ?? 60)

export interface OcrRateLimitResult {
  allowed: boolean
  currentCount: number
  limitCount: number
  windowStart: string
  /** Perkiraan kapan window berikutnya mulai, untuk header Retry-After. */
  retryAfterSeconds: number
}

/**
 * Cek + catat pemakaian OCR dalam satu panggilan atomik (lihat
 * increment_ocr_rate_limit di 0022_ocr_rate_limit.sql — INSERT ... ON CONFLICT
 * DO UPDATE, aman dari race condition tanpa lock terpisah). SELALU increment
 * dulu baru cek hasil — supaya request yang ditolak pun tetap tercatat
 * (mencegah bypass dengan spam request yang masing-masing "belum tahu" sudah
 * kena limit sebelumnya dalam window yang sama).
 */
export async function checkOcrRateLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  options?: { maxRequests?: number; windowMinutes?: number }
): Promise<OcrRateLimitResult> {
  const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS
  const windowMinutes = options?.windowMinutes ?? DEFAULT_WINDOW_MINUTES

  const { data, error } = await supabase
    .rpc('increment_ocr_rate_limit', {
      p_business_id: businessId,
      p_window_minutes: windowMinutes,
      p_max_requests: maxRequests,
    })
    .single()

  if (error || !data) {
    // Gagal cek rate limit (mis. RPC belum ter-deploy) — fail CLOSED untuk endpoint
    // berbayar seperti ini, bukan fail open. Lebih baik staf retry sebentar lagi
    // daripada bug infra jadi celah biaya OCR tak terbatas.
    throw new Error('Gagal memeriksa rate limit OCR, coba lagi sesaat lagi')
  }

  const windowStartMs = new Date(data.window_start).getTime()
  const windowEndMs = windowStartMs + windowMinutes * 60_000
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - Date.now()) / 1000))

  return {
    allowed: data.allowed,
    currentCount: data.current_count,
    limitCount: data.limit_count,
    windowStart: data.window_start,
    retryAfterSeconds,
  }
}
