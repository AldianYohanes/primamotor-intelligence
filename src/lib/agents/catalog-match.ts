/**
 * Pencocokan pesan staf ke katalog toko ini (nama produk + alias), pengganti daftar kata
 * suku cadang tulisan tangan di off-topic.ts untuk profil model yang memintanya. Katalog
 * dimuat dari cache perangkat (lihat cache/indexeddb.ts), jadi jalan offline dan tanpa
 * model. Katalog kosong berarti tidak pernah cocok, dan perilaku lama tetap berlaku.
 */

// Kata yang muncul di banyak nama produk tapi tidak menunjuk satu barang.
const GENERIC = new Set([
  "volvo", "depan", "belakang", "kiri", "kanan", "atas", "bawah", "tengah", "inch", "unit", "pcs", "buah",
  "pasang", "toko", "gudang", "untuk", "buat", "dengan", "yang", "set",
]);

const MIN_TOKEN = 4;

function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= MIN_TOKEN && !/^\d+$/.test(t));
}

/** Jarak edit (sisip, hapus, ganti), dihentikan begitu melewati batas. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/** Toleransi salah ketik menurut panjang kata: kata pendek harus persis. */
function allowedEdits(length: number): number {
  if (length >= 8) return 2;
  if (length >= 5) return 1;
  return 0;
}

let index = new Set<string>();

/** Ganti katalog yang dipakai pencocok; terima nama produk dan alias apa adanya. */
export function setCatalogTerms(terms: readonly string[]): void {
  index = new Set(terms.flatMap(tokensOf).filter((t) => !GENERIC.has(t)));
}

export function catalogSize(): number {
  return index.size;
}

/** Pesan menyebut (atau salah ketik) kata khas dari nama atau alias sebuah produk. */
export function mentionsCatalogProduct(message: string): boolean {
  if (index.size === 0) return false;
  for (const word of tokensOf(message)) {
    if (GENERIC.has(word)) continue;
    if (index.has(word)) return true;
    const edits = allowedEdits(word.length);
    if (edits === 0) continue;
    for (const known of index) if (withinEdits(word, known, edits)) return true;
  }
  return false;
}

/** Kata khas (bukan kata umum) dari sebuah teks, dengan panjang minimal pencocokan. */
export function distinctiveWords(text: string): string[] {
  return tokensOf(text).filter((t) => !GENERIC.has(t));
}

/** Kata ini muncul (atau salah ketik wajar) di salah satu kata `tokens`. */
export function wordInTokens(word: string, tokens: readonly string[]): boolean {
  const edits = allowedEdits(word.length);
  return tokens.some((t) => t === word || (edits > 0 && withinEdits(word, t, edits)));
}

/** Semua kata pesan (panjang minimal pencocokan), termasuk kata umum, untuk dibandingkan dengan nama barang. */
export function allMessageWords(text: string): string[] {
  return tokensOf(text);
}
