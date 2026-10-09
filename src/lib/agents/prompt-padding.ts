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

/** Teks netral dengan panjang tepat `chars` karakter (0 = kosong). */
export function buildNeutralPadding(chars: number): string {
  if (chars <= 0) return "";
  let out = "";
  while (out.length < chars) out += `${FILLER} `;
  return out.slice(0, chars);
}
