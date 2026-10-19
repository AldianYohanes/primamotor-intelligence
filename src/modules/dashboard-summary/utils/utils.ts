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

// monthKey formatnya 'YYYY-MM'. Sama seperti formatDayLabel, dibangun manual
// supaya tidak digeser timezone browser.
export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", {
    month: "short",
    year: "2-digit",
  });
}

export function formatRupiahShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".0", "")}jt`;
  if (v >= 1000) return `${Math.round(v / 1000)}rb`;
  return String(v);
}
