/** Contoh pertanyaan yang bisa diketuk di keadaan kosong chat. */
export const EXAMPLE_QUESTIONS = [
  "Ada radiator 240 gak?",
  "Stok filter oli berapa?",
  "Masuk barang 10 pcs filter oli",
  "Penjualan kampas rem 3 bulan terakhir",
] as const;

/**
 * Enter mengirim pesan, kecuali saat keyboard HP/IME masih menyusun kata
 * (isComposing) atau Shift ditekan.
 */
export function shouldSubmitOnEnter(e: {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
}): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing;
}

/** Pesan galat giliran chat, selalu dengan langkah berikutnya untuk staf. */
export function turnErrorMessage(online: boolean): string {
  return online
    ? "Maaf, asisten gagal menjawab. Coba kirim ulang pertanyaannya. Kalau tetap gagal, tekan Percakapan Baru atau muat ulang halaman."
    : "Maaf, asisten gagal menjawab karena sinyal terputus. Sambungkan internet lalu kirim ulang pertanyaannya.";
}

/** Sisa digit PIN yang masih kurang (PIN minimal 6 digit). */
export function pinDigitsLeft(pin: string, min = 6): number {
  return Math.max(0, min - pin.length);
}

const WAIT_HINT_AFTER_MS = 15_000;
const LONG_WAIT_AFTER_MS = 120_000;

/**
 * Penjelasan untuk giliran yang lama. Model jalan di perangkat ini, jadi 30 sampai 90 detik
 * wajar; tanpa penjelasan staf mengira aplikasi macet. Null selama masih terasa cepat.
 */
export function waitHint(elapsedMs: number): string | null {
  if (elapsedMs < WAIT_HINT_AFTER_MS) return null;
  if (elapsedMs < LONG_WAIT_AFTER_MS) {
    return "Model berjalan di perangkat ini, jawaban biasanya butuh 30 sampai 90 detik. Kamu bisa menekan Hentikan kapan saja.";
  }
  return "Ini lebih lama dari biasanya. Kalau jawaban belum muncul, tekan Hentikan lalu kirim ulang pertanyaannya.";
}

/** Apa yang sedang dikerjakan model, dalam kata staf (bukan "Router" atau "token"). */
export function liveCallText(label: string, liveTokens: number): string {
  const what = label === "Router" ? "Menentukan jenis pertanyaan" : "Menyusun jawaban";
  return `${what}${liveTokens > 0 ? "" : ", membaca pesan"}`;
}
