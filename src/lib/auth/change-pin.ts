import { isValidPin, PIN_MIN_LENGTH } from "./synthetic-email";

/**
 * Aturan ganti PIN yang sama dengan POST /api/account/pin (PIN baru minimal
 * 6 digit angka dan beda dari PIN lama). Dipakai form supaya salahnya ketahuan
 * sebelum request; server tetap memeriksa ulang. Murni, jadi bisa dites.
 */
export function validateChangePin(input: {
  currentPin: string;
  newPin: string;
  confirmPin: string;
}): string | null {
  if (!input.currentPin) return "Isi PIN lama";
  if (!isValidPin(input.newPin)) return `PIN baru minimal ${PIN_MIN_LENGTH} digit angka`;
  if (input.newPin === input.currentPin) return "PIN baru harus berbeda dari PIN lama";
  if (input.newPin !== input.confirmPin) return "Konfirmasi PIN baru tidak sama";
  return null;
}
