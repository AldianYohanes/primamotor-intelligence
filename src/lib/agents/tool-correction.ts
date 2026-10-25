import type { ParsedToolCall, ToolSuggestion } from "@/src/lib/agents/tool-protocol";
import { asksSalesTrend, guardRoute } from "@/src/lib/agents/route-guard";

/**
 * Pengaman kode untuk panggilan alat model kecil (profil agentRecovery). Model
 * menafsirkan, kode memeriksa pola yang jelas di pesan staf. Semua pemeriksaan
 * murni kata kunci dan hanya mengubah satu hal per panggilan.
 */

// Kata yang jelas berarti stok berkurang atau bertambah. "kurang" polos sengaja tidak
// ada: "stok toko kurang" artinya stok menipis, bukan perintah mengurangi.
const OUTBOUND_RE = /(?<![\p{L}\p{N}])(kejual|terjual|dijual|laku|keluar|kurangi|kurangin|kurangkan)(?![\p{L}\p{N}])/iu;
const INBOUND_RE = /(?<![\p{L}\p{N}])(masuk|datang|kiriman|diterima|terima|restock|tambah|tambahin|tambahkan)(?![\p{L}\p{N}])/iu;

/** Arah yang jelas dari pesan, atau null bila tidak ada kata arah atau kedua arah muncul. */
export function inferDirection(message: string): "masuk" | "keluar" | null {
  const out = OUTBOUND_RE.test(message);
  const inbound = INBOUND_RE.test(message);
  if (out === inbound) return null;
  return out ? "keluar" : "masuk";
}

export interface CorrectedCall {
  call: ParsedToolCall;
  /** Penjelasan untuk "Lihat proses"; null bila panggilan dibiarkan. */
  note: string | null;
}

/**
 * T-08 (run 23 Okt 2026): "Oli gardan 2 botol kejual barusan" dicatat Qwen3 1.7B sebagai
 * masuk. Q-13: "wiper bosch lagi rame gak" memanggil getStock, padahal pertanyaannya
 * penjualan. Pesan staf menang atas tebakan model hanya pada dua pola ini.
 */
export function correctToolCall(call: ParsedToolCall, message: string, allowedTools: ReadonlySet<string>): CorrectedCall {
  if (call.name === "updateStock" && typeof call.arguments.direction === "string") {
    const inferred = inferDirection(message);
    const written = call.arguments.direction.toLowerCase();
    if (inferred && written !== inferred && (written === "masuk" || written === "keluar")) {
      return {
        call: { ...call, arguments: { ...call.arguments, direction: inferred } },
        note: `Arah dikoreksi dari pesan staf: ${inferred} (model menulis ${written})`,
      };
    }
  }
  if (call.name === "getStock" && allowedTools.has("getSalesTrend") && asksSalesTrend(message)) {
    const product = String(call.arguments.query ?? call.arguments.product ?? "").trim();
    if (product) {
      return {
        call: { name: "getSalesTrend", arguments: { product } },
        note: "Pesan menanyakan penjualan, alat diganti dari getStock ke getSalesTrend",
      };
    }
  }
  return { call, note: null };
}

/**
 * Contoh panggilan untuk teguran "belum ada alat yang dipanggil" saat pesan staf jelas
 * soal stok: contoh pencatatan untuk pesan pencatatan, getStock untuk selainnya.
 * Null bila pesan tidak jelas soal stok, sehingga tidak ada teguran.
 */
export function missingCallSuggestion(message: string): { suggestion: ToolSuggestion | null } | null {
  const routed = guardRoute("off_topic", message).agentType;
  if (routed === "off_topic") return null;
  if (routed === "query") return { suggestion: null };
  return {
    suggestion: {
      name: "updateStock",
      arguments: {
        product: "<nama barang dari pesan staf>",
        quantity: "<jumlah dari pesan staf>",
        direction: "masuk atau keluar",
        location: "<toko atau gudang, kosongkan bila tidak disebut>",
      },
    },
  };
}
