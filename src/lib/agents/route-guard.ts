import { normalizeShorthand } from "@/src/lib/agents/normalize-shorthand";
import { mentionsSparePart } from "@/src/lib/agents/off-topic";

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

// Pertanyaan tentang kemampuan asisten ("kamu bisa cek stok?") memang dijawab OFF_TOPIC
// (balasan daftar kemampuan), jadi tidak boleh dialihkan.
const CAPABILITY_RE =
  /(?<![\p{L}\p{N}])(kamu|anda|asisten|bot)(?![\p{L}\p{N}]).*(?<![\p{L}\p{N}])(bisa|dapat|mampu)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(bisa|dapat)\s+apa(?![\p{L}])|kemampuan|fitur/iu;

// Menanyakan toko lain, harga, atau cara: bukan data stok toko ini.
const NOT_OUR_STOCK_RE =
  /(?<![\p{L}\p{N}])(harga|cara|kenapa|mengapa|rekomendasi|bagus|merek|beda)(?![\p{L}\p{N}])|toko\s+(sebelah|lain|depan|tetangga)/iu;

const STOCK_WORD_RE = /(?<![\p{L}\p{N}])(stok|stock)\w*(?![\p{L}\p{N}])/iu;
const CHANGE_VERB_RE = /(?<![\p{L}\p{N}])(kurang(?:i|in|kan)|tambah\w*|catat|catet)(?![\p{L}\p{N}])/iu;

// "rediator 240 ada ga", "masih pegang gak", "tinggal berapa", "kosong ya".
const AVAILABILITY_RE =
  /(?<![\p{L}\p{N}])(masih\s+(ada|pegang)|ada\s+(ga|gak|gk|ngga|nggak|tdk|tidak|kah)|ada\s*\?|ada\s+stok|masih\s+cukup|sisa|tinggal|kosong|habis|tersedia|ready|pegang)(?![\p{L}\p{N}])/iu;

// Pertanyaan tren/penjualan sebuah barang.
const TREND_RE =
  /(?<![\p{L}\p{N}])(jual(?:an|nya)?|penjualan(?:nya)?|laku|laris|rame|tren|trend|grafik)(?![\p{L}\p{N}])/iu;

export interface GuardedRoute {
  agentType: RoutedAgent;
  /** Alasan override untuk "Lihat proses"; null bila Router dibiarkan. */
  reason: string | null;
}

/**
 * Jaring pengaman Router. Query yang jelas berisi pencatatan dialihkan ke
 * transaksi (T-10). OFF_TOPIC yang menyebut stok, pencatatan dengan jumlah, atau
 * nama suku cadang dengan pertanyaan ketersediaan dialihkan ke agent stok
 * (Llama 3.2 membuang 23 dari 32 pesan stok/transaksi ke OFF_TOPIC). Nama barang
 * saja tidak cukup: "cara ganti busi" tetap off-topic.
 */
export function guardRoute(agentType: RoutedAgent, userMessage: string): GuardedRoute {
  if (agentType === "transaction") return { agentType, reason: null };
  if (isClearStockMovement(userMessage)) {
    return agentType === "query"
      ? { agentType: "transaction", reason: "Pesan berisi kata pergerakan barang dan jumlah, dialihkan ke Transaction Agent" }
      : { agentType: "transaction", reason: "Router menilai di luar topik, tapi pesan berisi pergerakan barang dan jumlah: dialihkan ke Transaction Agent" };
  }
  if (agentType === "off_topic") {
    const text = normalizeShorthand(userMessage);
    if (CAPABILITY_RE.test(text) || NOT_OUR_STOCK_RE.test(text)) return { agentType, reason: null };
    if (STOCK_WORD_RE.test(text)) {
      return CHANGE_VERB_RE.test(text)
        ? { agentType: "transaction", reason: "Router menilai di luar topik, tapi pesan menyebut stok dan perubahannya: dialihkan ke Transaction Agent" }
        : { agentType: "query", reason: "Router menilai di luar topik, tapi pesan menyebut stok: dialihkan ke Query Agent" };
    }
    if (mentionsSparePart(text) && (AVAILABILITY_RE.test(text) || TREND_RE.test(text))) {
      return { agentType: "query", reason: "Router menilai di luar topik, tapi pesan menanyakan ketersediaan atau penjualan suku cadang: dialihkan ke Query Agent" };
    }
  }
  return { agentType, reason: null };
}

/**
 * Pesan menanyakan penjualan atau tren sebuah barang, bukan stoknya ("wiper bosch
 * lagi rame gak?"). Kata stok atau ketersediaan di pesan membatalkannya: "penjualan
 * dan sisa stok" tetap dibaca sebagai pertanyaan stok.
 */
export function asksSalesTrend(message: string): boolean {
  const text = normalizeShorthand(message);
  return TREND_RE.test(text) && !STOCK_WORD_RE.test(text) && !AVAILABILITY_RE.test(text) && !SOLD_QUANTITY_RE.test(text);
}

// "laku 1", "kejual 3": jumlah terjual yang dicatat, bukan pertanyaan penjualan. Angka yang
// diikuti satuan waktu ("laku 3 bulan") tetap pertanyaan tren.
const SOLD_QUANTITY_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:laku|kejual|terjual|dijual)\s+(?:sebanyak\s+)?\d{1,4}(?![\p{L}\p{N}.,])(?!\s*(?:${PERIOD_WORDS})(?![\p{L}]))`,
  "iu",
);
