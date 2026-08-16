import type { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/src/lib/agents/orchestrator";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

/**
 * Sebelumnya: SETIAP kali halaman chat dibuka, baris agent_conversations baru
 * selalu dibuat, jadi riwayat percakapan sebelumnya tersimpan di DB tapi tidak
 * pernah dimuat lagi ke UI — staf yang refresh/reopen chat mulai dari kosong.
 *
 * Sekarang: cari percakapan staf ini yang masih "aktif" (ended_at is null,
 * dibuat maksimal 12 jam lalu — supaya percakapan kemarin tidak dianggap
 * nyambung ke hari ini), kalau ada pakai itu & muat pesannya; kalau tidak ada
 * baru buat baris baru.
 */
const ACTIVE_CONVERSATION_WINDOW_HOURS = 12;

export async function getOrCreateActiveConversation(
  supabase: SupabaseBrowserClient,
  businessId: string,
  staffId: string,
): Promise<{ conversationId: string; history: ChatMessage[] }> {
  const cutoff = new Date(
    Date.now() - ACTIVE_CONVERSATION_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: existing } = await supabase
    .from("agent_conversations")
    .select("id")
    .eq("staff_id", staffId)
    .is("ended_at", null)
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const history = await loadConversationHistory(supabase, existing.id);
    return { conversationId: existing.id, history };
  }

  const { data: created, error } = await supabase
    .from("agent_conversations")
    .insert({ business_id: businessId, staff_id: staffId, channel: "chat_pwa" })
    .select("id")
    .single();

  if (error || !created) throw new Error("Gagal membuat percakapan baru");
  return { conversationId: created.id, history: [] };
}

export async function loadConversationHistory(
  supabase: SupabaseBrowserClient,
  conversationId: string,
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("agent_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"]) // pesan 'tool' sengaja tidak ditampilkan ke staf
    .order("created_at", { ascending: true });

  return (data ?? []).map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content ?? "",
  }));
}

/**
 * Dipanggil dari tombol "Percakapan Baru" — menutup percakapan lama (ended_at)
 * supaya tidak lagi dianggap "aktif" oleh getOrCreateActiveConversation, lalu
 * membuat yang baru.
 */
export async function startNewConversation(
  supabase: SupabaseBrowserClient,
  businessId: string,
  staffId: string,
  currentConversationId: string | null,
): Promise<string> {
  if (currentConversationId) {
    await supabase
      .from("agent_conversations")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", currentConversationId);
  }

  const { data, error } = await supabase
    .from("agent_conversations")
    .insert({ business_id: businessId, staff_id: staffId, channel: "chat_pwa" })
    .select("id")
    .single();

  if (error || !data) throw new Error("Gagal membuat percakapan baru");
  return data.id;
}
