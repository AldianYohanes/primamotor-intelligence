export type NotificationType = "dead_stock" | "low_stock" | "reorder_suggestion" | "system";

export const NOTIFICATION_TYPES: NotificationType[] = ["low_stock", "reorder_suggestion", "dead_stock", "system"];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  low_stock: "Stok menipis",
  reorder_suggestion: "Saran belanja",
  dead_stock: "Stok mati",
  system: "Info sistem",
};

export function isNotificationType(value: string | null | undefined): value is NotificationType {
  return !!value && (NOTIFICATION_TYPES as string[]).includes(value);
}

/**
 * Tujuan tap pada notifikasi. related_id berisi id produk (lihat
 * app/api/cron/monitor), jadi owner dibawa ke kartu stok barang itu. Staf
 * kasir tidak punya Portal Admin, jadi notifikasinya tidak ditautkan.
 */
export function notificationHref(
  type: NotificationType,
  relatedId: string | null,
  canOpenPortal: boolean,
): string | null {
  if (!canOpenPortal) return null;
  if (type === "reorder_suggestion") return "/admin/reorder";
  if ((type === "low_stock" || type === "dead_stock") && relatedId) return `/admin/stock/${relatedId}`;
  return null;
}
