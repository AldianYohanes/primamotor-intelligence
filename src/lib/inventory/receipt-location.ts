/** Bon dari pemasok masuk ke Gudang; kalau tenant tidak punya Gudang, ke Toko pertama. */
export function pickReceiptLocation<T extends { type: string }>(locations: T[]): T | null {
  return locations.find((l) => l.type === "gudang") ?? locations.find((l) => l.type === "toko") ?? null;
}
