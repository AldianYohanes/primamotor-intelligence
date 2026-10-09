import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Konfirmasi PIN hanya boleh dilakukan staf yang mengusulkan transaksi. Pengusul
 * ditentukan dari pemilik percakapan (`agent_conversations.staff_id`), jadi
 * kepemilikan itu juga diperiksa saat transaksi diusulkan supaya
 * `conversation_id` tidak bisa dipalsukan ke percakapan staf lain.
 */
export async function conversationBelongsToStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  conversationId: string | null | undefined,
  staffId: string,
  businessId: string,
): Promise<boolean> {
  if (!conversationId) return false;
  const { data } = await admin
    .from("agent_conversations")
    .select("staff_id")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();
  return !!data && data.staff_id === staffId;
}
