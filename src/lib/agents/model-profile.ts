/**
 * Penyesuaian per model. Model yang tidak punya profil khusus memakai DEFAULT_PROFILE,
 * yang perilakunya sama persis dengan sebelum profil ada, jadi hasil evaluasi model
 * lain tidak bergeser.
 */
export interface ModelProfile {
  /** Router dipaksa menulis salah satu dari tiga label lewat response_format grammar. */
  routerGrammar: boolean;
  /** Prompt Router ringkas dengan contoh berpasangan, untuk model yang gagal mengikuti prompt panjang. */
  routerPrompt: "default" | "compact";
  /** Balasan Router tanpa label dirutekan lewat pengaman kode (guardRoute), bukan otomatis OFF_TOPIC. */
  routerRecovery: boolean;
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
  /** Pesan pencatatan yang jelas dirutekan kode ke Transaction Agent tanpa memanggil Router (hasilnya sama, tanpa waktu Router). */
  skipRouterForMovement: boolean;
  /** Nama barang dikenali dari katalog toko di cache perangkat saat pengaman rute menimbang pesan off-topic. */
  catalogRouting: boolean;
}

export const DEFAULT_PROFILE: ModelProfile = {
  routerGrammar: false,
  routerPrompt: "default",
  routerRecovery: false,
  agentRecovery: false,
  nudgeMissingCall: true,
  skipRouterForMovement: false,
  catalogRouting: false,
};

/**
 * Qwen3 1.7B (run 23 Okt 2026): Router sendiri hanya benar 37 dari 62. Balasannya
 * sering menyalin pesan staf atau memilih OFF_TOPIC untuk pertanyaan stok.
 */
const SMALL_QWEN3_PROFILE: ModelProfile = {
  routerGrammar: true,
  routerPrompt: "compact",
  routerRecovery: true,
  agentRecovery: true,
  nudgeMissingCall: true,
  skipRouterForMovement: true,
  catalogRouting: true,
};

export function getModelProfile(modelId: string): ModelProfile {
  if (/qwen3-(0\.6|1\.7)b/i.test(modelId)) return SMALL_QWEN3_PROFILE;
  return DEFAULT_PROFILE;
}
