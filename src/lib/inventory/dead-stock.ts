/**
 * Kandidat dead stock pada Monitoring Agent (Bab 3, arsitektur multi-agent).
 * Fungsi murni seperti reorder-calculation.ts: tanpa akses basis data supaya
 * mudah diuji. Hasilnya hanya saran untuk ditinjau staf; stok tidak diubah.
 */

// shortcut: satu batas untuk semua produk; naskah menyebut batas per kategori
// produk, upgrade bila kategori produk sudah punya kolom parameternya.
export const DEAD_STOCK_DAYS = 365;
// Cron jalan harian, jadi kandidat yang sama tidak dinotifikasi ulang
// sebelum jeda ini lewat.
export const DEAD_STOCK_REMINDER_DAYS = 30;

const DAY_MS = 86_400_000;

export interface DeadStockInput {
  totalAvailable: number;
  /** Waktu transaksi keluar terakhir; null bila produk belum pernah keluar. */
  lastOutboundAt: Date | string | null;
  /** Acuan selang bila belum pernah ada transaksi keluar. */
  productCreatedAt: Date | string;
  now?: Date;
  deadDays?: number;
}

export interface DeadStockCalculation {
  deadDays: number;
  totalAvailable: number;
  idleDays: number;
  isCandidate: boolean;
}

function toTime(value: Date | string): number {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

export function calculateDeadStock(input: DeadStockInput): DeadStockCalculation {
  const deadDays = Math.max(Math.trunc(input.deadDays ?? DEAD_STOCK_DAYS), 1);
  const totalAvailable = Number.isFinite(input.totalAvailable)
    ? Math.max(input.totalAvailable, 0)
    : 0;
  const now = (input.now ?? new Date()).getTime();

  // Tanpa transaksi keluar, hitung sejak produk dibuat. Tanggal tak terbaca
  // dianggap tidak ada selang, sehingga tidak pernah menandai produk keliru.
  const reference = toTime(input.lastOutboundAt ?? input.productCreatedAt);
  const idleDays = Number.isFinite(reference)
    ? Math.max(Math.floor((now - reference) / DAY_MS), 0)
    : 0;

  return {
    deadDays,
    totalAvailable,
    idleDays,
    isCandidate: totalAvailable > 0 && idleDays > deadDays,
  };
}

export function shouldCreateDeadStockNotification(
  calculation: DeadStockCalculation,
  hasRecentNotification: boolean,
): boolean {
  return calculation.isCandidate && !hasRecentNotification;
}
