/**
 * Singkatan chat sehari-hari staf toko → kata utuh, khusus untuk masukan Router.
 * Agent dan riwayat tetap memakai teks asli; Router (model kecil) lebih sering
 * salah menebak "klr 1 timng belt dr toko" dibanding "keluar 1 timng belt dari
 * toko". Hanya kata utuh yang diganti (huruf besar/kecil tidak dibedakan).
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
  pindahin: "pindahkan",
  kirimin: "kirimkan",
  trf: "transfer",
  transfr: "transfer",
};

const WORD_RE = /(?<![\p{L}\p{N}])[\p{L}]+(?![\p{L}\p{N}])/gu;

export function normalizeShorthand(text: string): string {
  return text.replace(WORD_RE, (word) => SHORTHAND[word.toLowerCase()] ?? word);
}
