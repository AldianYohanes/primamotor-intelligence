/**
 * Penyesuaian per model. Model yang tidak punya profil khusus memakai DEFAULT_PROFILE,
 * yang perilakunya sama persis dengan sebelum profil ada, jadi hasil evaluasi model
 * lain tidak bergeser.
 */
export interface ModelProfile {
  /** Router dipaksa menulis salah satu dari tiga label lewat response_format grammar. */
  routerGrammar: boolean;
  /** Prompt Router ringkas dengan contoh berpasangan, untuk model yang gagal mengikuti prompt panjang. */
  routerPrompt: "default" | "compact" | "tiny";
  /** "binary": dua pertanyaan ya/tidak (urusan stok? lalu minta mencatat?) alih-alih satu label tiga pilihan. */
  routerMode: "label" | "binary";
  /** Balasan Router tanpa label dirutekan lewat pengaman kode (guardRoute), bukan otomatis OFF_TOPIC. */
  routerRecovery: boolean;
  /**
   * Router menjawab TRANSACTION_AGENT untuk pesan yang jelas hanya bertanya (tanpa kata pergerakan
   * atau perubahan): kode mengalihkannya ke Query Agent (route-guard.ts). Qwen3.5 0.8B salah
   * begitu di 17 dari 54 pertanyaan stok (26 Okt 2026).
   */
  routerQueryGuard: boolean;
  /**
   * Pengaman panggilan alat di loop agent: panggilan gaya fungsi dibaca, arah updateStock dan
   * pilihan getStock/getSalesTrend dicocokkan dengan pesan staf, dan pesan soal stok yang dijawab
   * tanpa alat ditegur sekali (tool-correction.ts).
   */
  agentRecovery: boolean;
  /**
   * Pesan yang jelas soal stok tapi dijawab tanpa memanggil alat ditegur sekali. Aktif untuk semua
   * model (Qwen2.5-3B dua kali melewatkan getStock pada "stok mud flap belakang berapa?", uji Edge
   * 26 Okt 2026); isi false untuk mengembalikan perilaku sebelum teguran ini.
   */
  nudgeMissingCall: boolean;
  /**
   * Alat baca sudah memberi hasil tapi model tidak menulis jawaban yang bisa dipakai (kosong, rusak,
   * atau mengulang panggilan alat yang sama): jawaban disusun kode dari hasil alat, bukan "Maaf, saya
   * kurang mengerti" (Qwen3.5 0.8B, Q-01, 26 Okt 2026). Isi false untuk mengembalikan perilaku lama.
   */
  answerFromToolResult: boolean;
  /**
   * Batas token tiap panggilan Agent. Tanpa batas, Qwen3.5 0.8B menulis 2.700-3.000 token
   * ("Toko: 2, Gudang: 3" berulang, Q-01 dan Q-04, 26 Okt 2026) dan satu giliran sampai 230 detik.
   * null = tanpa batas (perilaku lama).
   */
  maxAgentTokens: number | null;
  /**
   * Balasan agent pertama (belum ada hasil alat) dipaksa berupa panggilan alat yang valid lewat
   * response_format grammar WebLLM, jadi "format rusak" dan lupa memanggil alat tidak mungkin
   * terjadi. Hanya dipakai di multi-agent untuk agent yang pasti memakai alat.
   */
  constrainedToolCall: boolean;
  /** Contoh tambahan (tren penjualan, pencatatan) di instruksi alat; contohnya bukan barang atau kalimat skenario eval. */
  toolExamples: boolean;
  /** Pesan pencatatan yang jelas dirutekan kode ke Transaction Agent tanpa memanggil Router (hasilnya sama, tanpa waktu Router). */
  skipRouterForMovement: boolean;
  /** Nama barang dikenali dari katalog toko di cache perangkat saat pengaman rute menimbang pesan off-topic. */
  catalogRouting: boolean;
  /**
   * Jumlah yang jelas disebut di pesan staf menang atas angka tulisan model (correctQuantity), jadi model
   * yang menulis 50 untuk "keluar 5" tidak sampai ke kartu PIN. Aktif untuk semua model; hanya profil
   * mentah /eval yang mematikannya, supaya kemampuan model sendiri tetap terukur.
   */
  quantityGuard: boolean;
}

export const DEFAULT_PROFILE: ModelProfile = {
  routerGrammar: false,
  routerPrompt: "default",
  routerMode: "label",
  routerRecovery: false,
  routerQueryGuard: false,
  agentRecovery: false,
  nudgeMissingCall: true,
  answerFromToolResult: true,
  maxAgentTokens: 400,
  constrainedToolCall: false,
  toolExamples: false,
  skipRouterForMovement: false,
  catalogRouting: true,
  quantityGuard: true,
};

/**
 * Qwen3 1.7B (run 23 Okt 2026): Router sendiri hanya benar 37 dari 62. Balasannya
 * sering menyalin pesan staf atau memilih OFF_TOPIC untuk pertanyaan stok.
 */
const SMALL_QWEN3_PROFILE: ModelProfile = {
  routerGrammar: true,
  routerPrompt: "compact",
  routerMode: "label",
  routerRecovery: true,
  routerQueryGuard: false,
  agentRecovery: true,
  nudgeMissingCall: true,
  answerFromToolResult: true,
  maxAgentTokens: 400,
  constrainedToolCall: false,
  toolExamples: false,
  skipRouterForMovement: true,
  catalogRouting: true,
  quantityGuard: true,
};

/**
 * Qwen3.5 0.8B (Q-01..Q-16, 26 Okt 2026): panggilan alat sering rusak, Router salah di 9 dari 16
 * giliran, dan model menulis sampai batas token. Profil model kecil ditambah keluaran alat yang
 * dipaksa valid dan contoh alat tambahan.
 */
const TINY_QWEN3_PROFILE: ModelProfile = {
  ...SMALL_QWEN3_PROFILE,
  routerPrompt: "tiny",
  routerMode: "binary",
  routerQueryGuard: true,
  constrainedToolCall: true,
  toolExamples: true,
};

/**
 * Semua pengaman profil dimatikan: dipakai /eval untuk mengukur kemampuan model sendiri
 * (kondisi "model mentah"). Pengaman yang berlaku untuk semua model (guardRoute, cek isi
 * jawaban terhadap hasil alat) tetap menyala, jadi ini batas bawah yang bersih, bukan model polos.
 */
export const RAW_PROFILE: ModelProfile = {
  routerGrammar: false,
  routerPrompt: "default",
  routerMode: "label",
  routerRecovery: false,
  routerQueryGuard: false,
  agentRecovery: false,
  nudgeMissingCall: false,
  answerFromToolResult: false,
  maxAgentTokens: null,
  constrainedToolCall: false,
  toolExamples: false,
  skipRouterForMovement: false,
  catalogRouting: false,
  quantityGuard: false,
};

let codeGuardsOff = false;

/** Hanya dipanggil halaman /eval; default hidup. */
export function setCodeGuardsOff(off: boolean): void {
  codeGuardsOff = off;
}

export function isCodeGuardsOff(): boolean {
  return codeGuardsOff;
}

export function getModelProfile(modelId: string): ModelProfile {
  if (codeGuardsOff) return RAW_PROFILE;
  if (/qwen3\.5-0\.8b/i.test(modelId)) return TINY_QWEN3_PROFILE;
  if (/qwen3-(0\.6|1\.7)b/i.test(modelId)) return SMALL_QWEN3_PROFILE;
  return DEFAULT_PROFILE;
}
