import { LOCKOUT_DURATION_MS, LOCKOUT_MAX_ATTEMPTS } from "@/src/lib/auth/synthetic-email";

/**
 * Pesan & data lockout PIN (5× salah → terkunci 15 menit) yang dipakai login dan
 * konfirmasi PIN, supaya staf tahu sisa percobaan dan kapan bisa mencoba lagi.
 * Jam buka kunci TIDAK diformat di server (server bisa berjalan di UTC); server
 * mengirim `locked_until` (ISO) dan klien memformatnya dengan zona waktu perangkat.
 */
export interface PinFailure {
  status: number;
  error: string;
  /** Sisa percobaan sebelum terkunci; hanya untuk PIN salah yang belum mengunci. */
  attemptsLeft?: number;
  /** ISO, saat akun terkunci. */
  lockedUntil?: string;
}

const LOCK_MINUTES = Math.round(LOCKOUT_DURATION_MS / 60000);

/** Hasil satu PIN salah sesudah counter dinaikkan menjadi `attempts`. */
export function wrongPinFailure(attempts: number, now = Date.now(), subject = "PIN"): PinFailure {
  const left = LOCKOUT_MAX_ATTEMPTS - attempts;
  if (left > 0) {
    return {
      status: 401,
      error: `${subject} salah. Sisa ${left} percobaan sebelum akun terkunci ${LOCK_MINUTES} menit.`,
      attemptsLeft: left,
    };
  }
  return {
    status: 423,
    error: `${subject} salah ${LOCKOUT_MAX_ATTEMPTS} kali. Akun terkunci ${LOCK_MINUTES} menit.`,
    lockedUntil: new Date(now + LOCKOUT_DURATION_MS).toISOString(),
  };
}

/** Percobaan saat akun masih terkunci. */
export function lockedFailure(lockedUntil: string, now = Date.now()): PinFailure {
  const minutes = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - now) / 60000));
  return {
    status: 423,
    error: `Akun terkunci sementara akibat ${LOCKOUT_MAX_ATTEMPTS}× PIN salah, coba lagi dalam ${minutes} menit.`,
    lockedUntil,
  };
}

/** Badan respons JSON untuk Route Handler. */
export function pinFailureBody(f: PinFailure) {
  return {
    error: f.error,
    ...(f.attemptsLeft !== undefined && { attempts_left: f.attemptsLeft }),
    ...(f.lockedUntil && { locked_until: f.lockedUntil }),
  };
}

/** Untuk klien: "Bisa dicoba lagi pukul 14.35." dari locked_until, dalam zona waktu perangkat. */
export function unlockTimeHint(lockedUntil: unknown): string {
  if (typeof lockedUntil !== "string") return "";
  const t = new Date(lockedUntil);
  if (Number.isNaN(t.getTime())) return "";
  const hhmm = t.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return ` Bisa dicoba lagi pukul ${hhmm}.`;
}
