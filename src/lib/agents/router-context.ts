import type { ChatMessage } from "@/src/lib/agents/orchestrator";
import { OFF_TOPIC_AUTOMOTIVE_REPLY, OFF_TOPIC_REPLY } from "@/src/lib/agents/off-topic";

/**
 * Konteks untuk Router: balasan asisten terakhir, KECUALI balasan yang disusun
 * kode (off-topic, "di luar kemampuan", "butuh koneksi", hasil dialog PIN, dst).
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
  const text = last.trim();
  const codeReplies = [OFF_TOPIC_REPLY, OFF_TOPIC_AUTOMOTIVE_REPLY, ...extraCodeReplies, ...DIALOG_REPLY_PREFIXES];
  return codeReplies.some((reply) => text.startsWith(reply.slice(0, 40))) ? undefined : last;
}

/** Awal balasan kode sesudah dialog PIN (PinConfirmDialog / ChatWindow). */
const DIALOG_REPLY_PREFIXES = ["Transaksi berhasil dicatat", "Transaksi dibatalkan", "Akun terkunci", "PIN salah"];
