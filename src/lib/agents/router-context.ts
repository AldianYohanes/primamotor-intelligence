import type { ChatMessage } from "@/src/lib/agents/orchestrator";
import { OFF_TOPIC_AUTOMOTIVE_REPLY, OFF_TOPIC_REPLY } from "@/src/lib/agents/off-topic";

/** Awal balasan kode sesudah dialog PIN (PinConfirmDialog / ChatWindow). */
const DIALOG_REPLY_PREFIXES = ["Transaksi berhasil dicatat", "Transaksi dibatalkan", "Akun terkunci", "PIN salah"];

/** Frasa di balasan kode yang bagian awalnya berubah-ubah (mis. nama barang). */
const CODE_REPLY_MARKERS = ["belum bisa dicek: sedang offline"];

/** Catatan kode yang ditempel di akhir jawaban dari cache (offline-answers.ts). */
const CACHE_NOTE_START = "(Data dari cache perangkat";

/**
 * Balasan yang disusun kode, bukan model: off-topic, "di luar kemampuan",
 * "butuh koneksi", "belum bisa dicek", hasil dialog PIN, dst. `extraCodeReplies`
 * diisi orchestrator dengan konstanta miliknya (menghindari impor melingkar).
 */
export function isCodeReply(text: string, extraCodeReplies: readonly string[] = []): boolean {
  const t = text.trim();
  const prefixes = [OFF_TOPIC_REPLY, OFF_TOPIC_AUTOMOTIVE_REPLY, ...extraCodeReplies, ...DIALOG_REPLY_PREFIXES];
  return prefixes.some((reply) => t.startsWith(reply.slice(0, 40))) || CODE_REPLY_MARKERS.some((m) => t.includes(m));
}

/**
 * Konteks untuk Router: balasan asisten terakhir, KECUALI balasan yang disusun
 * kode.
 *
 * Uji M4 9 Okt 2026: sekali Router menilai off-topic, balasan "Itu di luar data
 * stok toko ini…" masuk sebagai konteks pesan berikutnya dan mendorong Router
 * menjawab OFF_TOPIC lagi, sehingga semua pertanyaan stok sesudahnya ikut
 * ditolak. Balasan kode tidak membawa konteks percakapan yang berguna, jadi
 * dibuang; balasan lama sebelumnya juga tidak dipakai karena sudah basi.
 */
export function routerContext(history: ChatMessage[], extraCodeReplies: readonly string[] = []): string | undefined {
  const last = history.findLast((m) => m.role === "assistant")?.content;
  if (!last) return undefined;
  return isCodeReply(last, extraCodeReplies) ? undefined : stripCacheNote(last);
}

/**
 * Riwayat untuk agent: tanpa balasan kode dan pertanyaan staf yang memicunya,
 * dan tanpa catatan cache di akhir jawaban.
 *
 * Uji M4 9 Okt 2026: sesudah satu balasan kode "Stok busi bosch belum bisa
 * dicek…", Query Agent menyalinnya untuk pertanyaan berikutnya ("stok filter oli
 * mahle?") tanpa memanggil getStock, padahal barangnya ada di cache.
 */
export function agentHistory(history: ChatMessage[], extraCodeReplies: readonly string[] = []): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of history) {
    if (m.role === "assistant" && isCodeReply(m.content, extraCodeReplies)) {
      if (out.at(-1)?.role === "user") out.pop();
      continue;
    }
    out.push(m.role === "assistant" ? { ...m, content: stripCacheNote(m.content) } : m);
  }
  return out;
}

function stripCacheNote(text: string): string {
  const i = text.lastIndexOf(CACHE_NOTE_START);
  return i > 0 ? text.slice(0, i).trimEnd() : text;
}
