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
}

export const DEFAULT_PROFILE: ModelProfile = {
  routerGrammar: false,
  routerPrompt: "default",
  routerRecovery: false,
};

/**
 * Qwen3 1.7B (run 23 Okt 2026): Router sendiri hanya benar 37 dari 62. Balasannya
 * sering menyalin pesan staf atau memilih OFF_TOPIC untuk pertanyaan stok.
 */
const SMALL_QWEN3_PROFILE: ModelProfile = {
  routerGrammar: true,
  routerPrompt: "compact",
  routerRecovery: true,
};

export function getModelProfile(modelId: string): ModelProfile {
  if (/qwen3-(0\.6|1\.7)b/i.test(modelId)) return SMALL_QWEN3_PROFILE;
  return DEFAULT_PROFILE;
}
