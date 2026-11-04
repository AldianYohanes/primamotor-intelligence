import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Usulan transaksi 'pending' memegang reservasi stok sampai dikonfirmasi, dibatalkan, atau kedaluwarsa
 * (15 menit). Tanpa batas, percakapan yang berulang-ulang mengusulkan "keluar" (staf iseng, model yang
 * mengulang, atau instruksi terselip di data) bisa menahan seluruh stok dan menolak penjualan kasir.
 */
export const MAX_PENDING_PROPOSALS = 5;

export async function tooManyPendingProposals(
  admin: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<boolean> {
  const { count } = await admin
    .from("agent_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("status", "pending");
  return (count ?? 0) >= MAX_PENDING_PROPOSALS;
}

export const TOO_MANY_PENDING_MESSAGE =
  "Masih ada beberapa usulan transaksi yang belum dikonfirmasi di percakapan ini. Konfirmasi atau batalkan dulu, atau tunggu 15 menit.";
