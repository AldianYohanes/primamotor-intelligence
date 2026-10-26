/**
 * Pemeriksa teks jawaban yang ngelantur. Dipakai agent (membuang jawaban model yang rusak
 * saat hasil alatnya sudah ada) dan penilaian "ETSR ketat" di /eval, jadi satu aturan untuk keduanya.
 */

/** Jawaban stok/tren yang wajar jauh di bawah ini; lewat dari ini hampir pasti ngelantur. */
export const MAX_ANSWER_CHARS = 600;

const SELF_TALK_RE = /\b(?:tapi|eh)\s+tunggu\b|\btunggu\s+dulu\b|\b(?:staf|kamu)\s*:|<\|im_|<\/?tool_call>|<\/?think>/i;
const FALLBACK_RE = /terlalu\s+kompleks|kurang\s+mengerti/i;

/** Kalimat atau baris yang sama (≥ 8 huruf) muncul tiga kali atau lebih. */
export function hasRepetition(text: string): boolean {
  const seen = new Map<string, number>();
  for (const part of text.split(/\n+|(?<=[.!?])\s+/)) {
    const key = part.trim().toLowerCase();
    if (key.length < 8) continue;
    const count = (seen.get(key) ?? 0) + 1;
    if (count >= 3) return true;
    seen.set(key, count);
  }
  return false;
}

/** "Tapi tunggu", percakapan "Staf:/Kamu:", atau sisa tag model. */
export function hasSelfTalk(text: string): boolean {
  return SELF_TALK_RE.test(text);
}

/** Jawaban cadangan sistem atau permintaan maaf model ("terlalu kompleks", "kurang mengerti"). */
export function isFallbackAnswer(text: string): boolean {
  return FALLBACK_RE.test(text);
}

/** Jawaban yang tidak layak sampai ke staf: panjang berlebihan, berulang, atau ngomong sendiri. */
export function isDegenerateAnswer(text: string): boolean {
  return text.length > MAX_ANSWER_CHARS || hasRepetition(text) || hasSelfTalk(text);
}
