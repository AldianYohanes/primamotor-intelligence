import { normalizeShorthand } from "@/src/lib/agents/normalize-shorthand";

/**
 * Pengaman kode di sekitar keputusan Router (model kecil): LLM menafsirkan,
 * kode memeriksa pola yang jelas. Semua pemeriksaan murni kata kunci, tanpa
 * jaringan.
 */
export type RoutedAgent = "query" | "transaction" | "off_topic";

// Kata kerja pergerakan barang yang kuat. "jual", "penjualan", dan "trend" sengaja
// tidak ada: itu juga dipakai di pertanyaan tren ("trend jual kampas 3 bulan").
const STRONG_MOVEMENT_RE =
  /(?<![\p{L}\p{N}])(masuk|keluar|pindah\w*|transfer|kejual|terjual|retur)(?![\p{L}\p{N}])/iu;

const PERIOD_WORDS = "bulan|tahun|hari|minggu|mingguan|pekan|jam";
const UNIT_WORDS = "pcs|biji|buah|unit|set|pasang|botol|lembar|batang|pak|dus|karton|roll|liter";

// Jumlah yang jelas: angka tepat sesudah kata kerja ("keluar 1 timing belt"), atau
// angka bersatuan barang ("2 biji"). Angka lain (kode model "240") tidak dihitung.
// Angka yang diikuti satuan waktu ("masuk 3 bulan terakhir") bukan jumlah.
const QTY_AFTER_VERB_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:masuk|keluar|pindah\w*|transfer|kejual|terjual|retur)\s+(?:sebanyak\s+|sejumlah\s+)?(\d{1,4})(?![\p{L}\p{N}.,])(?!\s*(?:${PERIOD_WORDS})(?![\p{L}]))`,
  "iu",
);
const QTY_WITH_UNIT_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(\d{1,4})\s*(?:${UNIT_WORDS})(?![\p{L}])`, "iu");

/** Pesan jelas berisi pencatatan barang: kata kerja pergerakan + jumlah. */
export function isClearStockMovement(message: string): boolean {
  const text = normalizeShorthand(message);
  if (!STRONG_MOVEMENT_RE.test(text)) return false;
  return QTY_AFTER_VERB_RE.test(text) || QTY_WITH_UNIT_RE.test(text);
}

export interface GuardedRoute {
  agentType: RoutedAgent;
  /** Alasan override untuk "Lihat proses"; null bila Router dibiarkan. */
  reason: string | null;
}

export function guardRoute(agentType: RoutedAgent, userMessage: string): GuardedRoute {
  if (agentType === "query" && isClearStockMovement(userMessage)) {
    return {
      agentType: "transaction",
      reason: "Pesan berisi kata pergerakan barang dan jumlah, dialihkan ke Transaction Agent",
    };
  }
  return { agentType, reason: null };
}
