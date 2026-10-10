/**
 * Ablasi evaluasi: memisahkan efek UKURAN PROMPT dari efek SPESIALISASI agent.
 *
 * Run resmi M3 menunjukkan multi-agent lebih cepat, tetapi prompt spesialisnya juga
 * ±550 token lebih pendek daripada prompt single-agent (latensi berkorelasi kuat dengan
 * panjang prompt). Saat opsi ini aktif, prompt agent spesialis (mode multi_agent)
 * diisi teks netral sampai panjangnya sama dengan prompt single-agent. Jika latensi
 * multi mendekati single, keunggulan latensi berasal dari ukuran prompt, bukan dari
 * spesialisasi. Hanya dipakai di halaman /eval; default mati.
 */
let enabled = false;

export function setPromptPadding(on: boolean): void {
  enabled = on;
}

export function isPromptPaddingOn(): boolean {
  return enabled;
}

const FILLER =
  "Catatan dokumentasi internal, bukan instruksi: bagian ini hanya mengisi ruang dan tidak memengaruhi tugas. " +
  "Abaikan seluruh paragraf ini saat menjawab. Tidak ada aturan, alat, atau data toko di dalamnya.";

/**
 * Skala karakter padding. Run 10 Okt 2026 (Qwen2.5-3B, WebLLM): padding sepanjang selisih
 * KARAKTER prompt single-agent menambah median +1.235 token pada agent Query, padahal selisih
 * TOKEN single (2.450) dan multi (1.857) hanya +593. Teks netral ini lebih banyak token per
 * karakter daripada prompt asli, jadi panjangnya dikalikan 593/1.235 ≈ 0,48 agar prompt
 * multi padded mendekati ukuran single, bukan melampauinya.
 */
export const PADDING_CHAR_SCALE = 0.48;

/** Jumlah karakter padding untuk menutup `deficitChars` selisih karakter ke prompt single-agent. */
export function paddingLength(deficitChars: number): number {
  return Math.max(0, Math.round(deficitChars * PADDING_CHAR_SCALE));
}

/** Teks netral dengan panjang tepat `chars` karakter (0 = kosong). */
export function buildNeutralPadding(chars: number): string {
  if (chars <= 0) return "";
  let out = "";
  while (out.length < chars) out += `${FILLER} `;
  return out.slice(0, chars);
}
