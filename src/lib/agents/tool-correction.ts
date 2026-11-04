import type { ParsedToolCall, ToolSuggestion } from "@/src/lib/agents/tool-protocol";
import { asksSalesTrend, guardRoute, type GuardOptions } from "@/src/lib/agents/route-guard";
import { inferTransferDirection } from "@/src/lib/agents/location-choice";
import { allMessageWords, distinctiveWords, wordInTokens } from "@/src/lib/agents/catalog-match";

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

const PERIOD_AFTER = String.raw`(?!\s*(?:bulan|bln|tahun|thn|hari|minggu|pekan|jam)(?![\p{L}]))`;
// Jumlah yang jelas: angka tepat sesudah kata kerja pergerakan, atau angka bersatuan barang.
const VERB_QUANTITY_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:masuk|keluar|pindah\w*|transfer|kejual|terjual|dijual|laku|retur|tambah\w*|kurang\w*)\s+(?:sebanyak\s+)?(\d{1,4})(?![\p{L}\p{N}.,])${PERIOD_AFTER}`,
  "giu",
);
const UNIT_QUANTITY_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(\d{1,4})\s*(?:pcs|biji|buah|unit|set|pasang|botol|lembar|batang|pak|dus|karton|roll|liter)(?![\p{L}])`,
  "giu",
);

/**
 * Jumlah yang disebut staf bila pesan hanya memuat satu angka jelas (angka dekat kata kerja atau
 * satuan), selain itu null. Kode model seperti "240" tidak pernah dihitung sebagai jumlah.
 */
export function statedQuantity(message: string): number | null {
  const found = new Set<number>();
  for (const re of [VERB_QUANTITY_RE, UNIT_QUANTITY_RE]) for (const m of message.matchAll(re)) found.add(Number(m[1]));
  return found.size === 1 ? [...found][0] : null;
}

/**
 * "hella 240 laku 1 di toko" ditulis Qwen3 1.7B dengan jumlah 240 (kode model terbawa jadi
 * jumlah). Angka yang jelas di pesan staf menang atas tulisan model.
 */
export function correctQuantity(call: ParsedToolCall, message: string): CorrectedCall {
  if (call.name !== "updateStock" && call.name !== "transferStock") return { call, note: null };
  const stated = statedQuantity(message);
  if (stated === null || Number(call.arguments.quantity) === stated) return { call, note: null };
  return {
    call: { ...call, arguments: { ...call.arguments, quantity: stated } },
    note: `Jumlah dikoreksi dari pesan staf: ${stated} (model menulis ${String(call.arguments.quantity)})`,
  };
}

/**
 * updateStock dipanggil padahal pesan menyebut toko dan gudang tanpa kata masuk atau keluar:
 * "Toko butuh 2 lampu, ambil dari gudang" artinya pindah. Kata depan dari/ke menentukan arah.
 * null bila bukan kasus ini, atau arahnya tidak jelas.
 */
export function transferCallFrom(call: ParsedToolCall, message: string, names: [string, string]): CorrectedCall | null {
  if (call.name !== "updateStock" || inferDirection(message) !== null) return null;
  const direction = inferTransferDirection(message, names);
  if (!direction) return null;
  return {
    call: {
      name: "transferStock",
      arguments: {
        product: call.arguments.product ?? call.arguments.product_name,
        quantity: call.arguments.quantity,
        from_location: direction.from,
        to_location: direction.to,
        reasoning: call.arguments.reasoning,
      },
    },
    note: `Pesan menyebut dua lokasi tanpa kata masuk atau keluar: dicatat sebagai pindah dari ${direction.from} ke ${direction.to}`,
  };
}

/**
 * T-15 "Kurangin stok lampu" ditulis single-agent Qwen3 sebagai barang "lampu sein": kata 'sein'
 * karangan (ada di contoh prompt), jadi barang tidak ditemukan. Kata nama barang yang tidak ada di
 * pesan staf dibuang, hanya bila setidaknya separuh kata khasnya cocok dengan pesan. Terjemahan
 * wajar ("tail lamp" jadi "lampu belakang") tidak memenuhi syarat itu, jadi dibiarkan.
 */
export function groundProductName(call: ParsedToolCall, message: string): CorrectedCall {
  const product = call.arguments.product;
  if ((call.name !== "updateStock" && call.name !== "transferStock") || typeof product !== "string") return { call, note: null };
  const words = product.trim().split(/\s+/);
  const distinctive = words.filter((w) => distinctiveWords(w).length > 0);
  const messageWords = allMessageWords(message);
  const matched = distinctive.filter((w) => wordInTokens(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""), messageWords));
  if (distinctive.length < 2 || matched.length === 0 || matched.length === distinctive.length || matched.length * 2 < distinctive.length) {
    return { call, note: null };
  }
  const kept = words.filter((w) => distinctiveWords(w).length === 0 || matched.includes(w));
  const grounded = kept.join(" ");
  return {
    call: { ...call, arguments: { ...call.arguments, product: grounded } },
    note: `Nama barang dicocokkan dengan pesan staf: "${product}" jadi "${grounded}"`,
  };
}

/** Semua koreksi argumen berurutan; catatannya digabung untuk "Lihat proses". */
export function applyCorrections(call: ParsedToolCall, message: string, allowedTools: ReadonlySet<string>): CorrectedCall {
  const first = correctToolCall(call, message, allowedTools);
  const second = correctQuantity(first.call, message);
  const third = groundProductName(second.call, message);
  const notes = [first.note, second.note, third.note].filter((n): n is string => n !== null);
  return { call: third.call, note: notes.length > 0 ? notes.join("; ") : null };
}

/**
 * Contoh panggilan untuk teguran "belum ada alat yang dipanggil" saat pesan staf jelas
 * soal stok: contoh pencatatan untuk pesan pencatatan, getStock untuk selainnya.
 * Null bila pesan tidak jelas soal stok, sehingga tidak ada teguran.
 */
export function missingCallSuggestion(message: string, options: GuardOptions = {}): { suggestion: ToolSuggestion | null } | null {
  const routed = guardRoute("off_topic", message, options).agentType;
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
