/**
 * Transaction Agent kadang hanya membaca stok (getStock) lalu menulis "konfirmasi
 * dengan PIN", padahal tidak ada alat tulis yang dipanggil dan tidak ada PIN yang
 * diminta sistem (H-14, "brp stok ... di gdg"). Jawaban seperti itu diperlakukan
 * sebagai jawaban query: permintaan PIN dibuang.
 */
const PIN_RE = /(?<![\p{L}\p{N}])pin(?![\p{L}\p{N}])/iu;

export function mentionsPinConfirmation(text: string): boolean {
  return PIN_RE.test(text);
}

// Dikirim sebagai hasil alat: model diminta menjawab ulang tanpa PIN.
export const READ_ONLY_PIN_FEEDBACK = `<tool_response>
{"error": "Tidak ada perubahan stok yang dicatat, jadi tidak ada PIN. Jawab pertanyaan staf dengan data dari hasil alat tadi, tanpa menyebut PIN atau konfirmasi."}
</tool_response>`;

/** Buang kalimat yang menyebut PIN; baris dan kalimat lain tetap. */
export function dropPinSentences(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const sentences = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line];
      return sentences.filter((s) => !PIN_RE.test(s)).join("").trim();
    })
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}
