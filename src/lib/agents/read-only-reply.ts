/**
 * Transaction Agent kadang hanya membaca stok (getStock) lalu menulis "konfirmasi
 * dengan PIN", padahal tidak ada alat tulis yang dipanggil dan tidak ada PIN yang
 * diminta sistem (H-14, "brp stok ... di gdg"). Jawaban seperti itu diperlakukan
 * sebagai jawaban query: permintaan PIN dibuang.
 *
 * Yang dicocokkan adalah frasa permintaan ("konfirmasi dengan PIN", "masukkan
 * PIN"), bukan kata "pin" tunggal: "pin piston" atau "pin kaliper" adalah nama
 * barang, dan nama barang dari hasil getStock juga diabaikan.
 */
const WORD_PIN = String.raw`(?<![\p{L}\p{N}])pin(?![\p{L}\p{N}])`;
const PIN_WORD_RE = new RegExp(WORD_PIN, "iu");
const REQUEST_VERBS = String.raw`(?:konfirmasi(?:kan)?|verifikasi|masukkan|masukan|isi(?:kan)?|ketik(?:kan)?|input|dengan|via|lewat|pakai|gunakan|butuh|perlu|memerlukan|meminta|minta)`;
const PIN_REQUEST_RE = new RegExp(
  [
    // "konfirmasi dengan PIN", "masukkan PIN", "perlu konfirmasi PIN"
    String.raw`(?<![\p{L}\p{N}])${REQUEST_VERBS}(?![\p{L}\p{N}])[^.!?\n,;]{0,30}?${WORD_PIN}`,
    // "PIN Anda", "PIN konfirmasi"
    String.raw`${WORD_PIN}\s+(?:anda|kamu|mu|konfirmasi|confirmation)(?![\p{L}\p{N}])`,
    String.raw`(?<![\p{L}\p{N}])kode\s+pin(?![\p{L}\p{N}])`,
  ].join("|"),
  "iu",
);

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Buang nama barang yang memuat kata "pin" (mis. "Pin Piston") sebelum mencari frasa PIN. */
function withoutProductNames(text: string, productNames: string[]): string {
  let out = text;
  for (const name of productNames) {
    const trimmed = name.trim();
    if (trimmed && PIN_WORD_RE.test(trimmed)) out = out.replace(new RegExp(escapeRe(trimmed), "gi"), " ");
  }
  return out;
}

/** Staf sendiri menyebut PIN di pesannya (mis. "tidak perlu PIN", "PIN saya lupa"). */
export function staffMentionsPin(message: string): boolean {
  return PIN_WORD_RE.test(message);
}

export function mentionsPinConfirmation(text: string, productNames: string[] = []): boolean {
  return PIN_REQUEST_RE.test(withoutProductNames(text, productNames));
}

// Dikirim sebagai hasil alat: model diminta menjawab ulang tanpa PIN.
export const READ_ONLY_PIN_FEEDBACK = `<tool_response>
{"error": "Tidak ada perubahan stok yang dicatat, jadi tidak ada PIN. Jawab pertanyaan staf dengan data dari hasil alat tadi, tanpa menyebut PIN atau konfirmasi."}
</tool_response>`;

// Titik desimal/ribuan ("Rp 25.000", "2.5") bukan akhir kalimat.
const SENTENCE_RE = /(?:[^.!?]|\.(?=\d))+[.!?]*\s*/g;
const CLAUSE_SPLIT_RE = /\s*(?:,|;|(?<![\p{L}\p{N}])(?:dan|lalu|kemudian|serta)(?![\p{L}\p{N}]))\s*/giu;

/**
 * Buang bagian yang menyebut PIN; baris dan kalimat lain tetap. Kalimat campur
 * ("Stok di Gudang 3 pcs, silakan konfirmasi dengan PIN.") dipotong per anak
 * kalimat supaya datanya ikut selamat.
 */
export function dropPinSentences(text: string, productNames: string[] = []): string {
  const hasPin = (s: string) => mentionsPinConfirmation(s, productNames);
  return text
    .split("\n")
    .map((line) => {
      const sentences = line.match(SENTENCE_RE) ?? [line];
      return sentences
        .map((sentence) => {
          if (!hasPin(sentence)) return sentence;
          const trailing = /[.!?]+\s*$/.exec(sentence)?.[0].trim() ?? "";
          const body = trailing ? sentence.slice(0, sentence.lastIndexOf(trailing)) : sentence;
          const kept = body
            .split(CLAUSE_SPLIT_RE)
            .map((c) => c.trim())
            .filter((c) => c !== "" && !hasPin(c));
          if (kept.length === 0) return "";
          return `${kept.join(", ")}${trailing || "."} `;
        })
        .join("")
        .trim();
    })
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}
