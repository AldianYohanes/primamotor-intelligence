/**
 * Singkatan chat sehari-hari staf toko → kata utuh, untuk masukan Router dan agent.
 * Riwayat tetap memakai teks asli; model kecil lebih sering
 * salah menebak "klr 1 timng belt dr toko" dibanding "keluar 1 timng belt dari toko". Hanya kata utuh yang diganti (huruf besar/kecil tidak dibedakan).
 *
 * Daftar ini kebiasaan chat umum, bukan diambil dari kalimat skenario uji.
 * Singkatan yang bisa berarti lain ("tk", "sm", "jg") sengaja tidak dimasukkan.
 */
const SHORTHAND: Record<string, string> = {
  klr: "keluar",
  kluar: "keluar",
  msk: "masuk",
  dr: "dari",
  dgn: "dengan",
  brp: "berapa",
  gdg: "gudang",
  gdng: "gudang",
  gudng: "gudang",
  bln: "bulan",
  thn: "tahun",
  yg: "yang",
  utk: "untuk",
  sdh: "sudah",
  udh: "sudah",
  blm: "belum",
  msh: "masih",
  ad: "ada",
  pgng: "pegang",
  pindahin: "pindahkan",
  kirimin: "kirimkan",
  trf: "transfer",
  transfr: "transfer",
};

const WORD_RE = /(?<![\p{L}\p{N}])[\p{L}]+(?![\p{L}\p{N}])/gu;

export function normalizeShorthand(text: string): string {
  return text.replace(WORD_RE, (word) => SHORTHAND[word.toLowerCase()] ?? word);
}

/**
 * Pesan staf terbaru yang dikirim ke agent (Query, Transaction, single agent).
 * Model kecil menafsirkan "klr 2 v-belt dr gdg" sebagai barang masuk; dengan kata
 * utuh arahnya ikut benar. Riwayat chat tetap teks asli.
 */
export function agentInputMessage(text: string): string {
  return normalizeShorthand(text);
}
