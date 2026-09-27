export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// dateStr formatnya 'YYYY-MM-DD' (dari route handler), bukan ISO timestamp
// penuh — pakai construction manual (bukan `new Date(dateStr)` langsung)
// supaya tidak digeser timezone browser staf saat parsing tanggal tanpa jam.
export function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}
