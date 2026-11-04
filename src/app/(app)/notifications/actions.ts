"use server";

import { revalidatePath } from "next/cache";
import { requirePage } from "@/src/lib/auth/staff-context";

/** Tandai satu notifikasi sebagai sudah dibaca oleh staf yang sedang masuk. */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const { supabase, staff } = await requirePage(null);
  // Sudah dibaca = baris sudah ada; ignoreDuplicates supaya ketukan berulang tidak error.
  await supabase
    .from("notification_reads")
    .upsert({ notification_id: notificationId, staff_id: staff.id }, { onConflict: "notification_id,staff_id", ignoreDuplicates: true });
  revalidatePath("/notifications");
}

/** Tandai semua notifikasi yang terlihat oleh staf ini sebagai sudah dibaca. */
export async function markAllNotificationsRead(): Promise<void> {
  const { supabase, staff, tenant } = await requirePage(null);
  await supabase.rpc("mark_all_notifications_read", { p_staff_id: staff.id, p_business_id: tenant.id });
  revalidatePath("/notifications");
}
