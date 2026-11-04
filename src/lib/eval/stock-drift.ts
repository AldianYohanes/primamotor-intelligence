import type { StockSnapshot } from "@/src/lib/eval/types";

/**
 * Kunci stok yang nilainya beda antara keadaan akhir eksekusi terakhir dan stok sekarang.
 * Dipakai saat run dilanjutkan: run 27 Okt 2026 menemukan 29 kunci berubah selagi run berhenti,
 * lalu T-05 gagal karena stok Radiator Toko sudah 0, bukan karena model.
 */
export function stockDrift(expected: StockSnapshot, current: StockSnapshot): string[] {
  const keys = new Set([...Object.keys(expected), ...Object.keys(current)]);
  return [...keys].filter((k) => (expected[k] ?? 0) !== (current[k] ?? 0)).sort();
}
