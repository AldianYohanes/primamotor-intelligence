import type { ChatMessage } from "@/src/lib/agents/orchestrator";

/**
 * Sliding window riwayat untuk agent spesialis (context-management.tex): UI tetap
 * menampilkan seluruh percakapan, tapi yang dikirim ke model hanya potongan
 * terbaru supaya prompt + definisi tool + riwayat tidak melebihi context window
 * model kecil (Qwen2.5-3B di WebLLM ~4K token). Percakapan lama yang dilanjutkan
 * dari "Riwayat" bisa berisi puluhan pesan, jadi batas ini wajib.
 *
 * Dua batas sekaligus: jumlah pesan (menjaga konteks tetap relevan) dan jumlah
 * karakter (menjaga satu-dua jawaban panjang, mis. daftar stok, tidak
 * menghabiskan jendela). Karakter dipakai sebagai proxy token, sama seperti
 * contextLengthAtCall di orchestrator.ts.
 */
export const HISTORY_WINDOW_MAX_MESSAGES = 10;
export const HISTORY_WINDOW_MAX_CHARS = 4000;

export function trimHistoryForContext(
  history: ChatMessage[],
  maxMessages = HISTORY_WINDOW_MAX_MESSAGES,
  maxChars = HISTORY_WINDOW_MAX_CHARS,
): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let chars = 0;

  for (let i = history.length - 1; i >= 0 && kept.length < maxMessages; i--) {
    const msg = history[i];
    if (chars + msg.content.length > maxChars) break;
    chars += msg.content.length;
    kept.unshift(msg);
  }

  // Jangan mulai dari jawaban asisten yang pertanyaannya sudah terpotong —
  // model bisa mengira jawaban itu tanggapan atas pesan lain.
  while (kept.length > 0 && kept[0].role === "assistant") kept.shift();
  return kept;
}
