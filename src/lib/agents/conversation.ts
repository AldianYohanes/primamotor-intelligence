import type { createClient } from "@/src/lib/supabase/client";
import type { ChatMessage, ProcessStep } from "@/src/lib/agents/orchestrator";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

/** Pesan yang ditampilkan di chat: pesan asisten bisa membawa langkah "Lihat proses". */
export type StoredChatMessage = ChatMessage & { trace?: ProcessStep[] };

/**
 * Sebelumnya: SETIAP kali halaman chat dibuka, baris agent_conversations baru
 * selalu dibuat, jadi riwayat percakapan sebelumnya tersimpan di DB tapi tidak
 * pernah dimuat lagi ke UI — staf yang refresh/reopen chat mulai dari kosong.
 *
 * Sekarang: cari percakapan staf ini yang masih "aktif" (ended_at is null dan
 * aktivitas terakhirnya maksimal 12 jam lalu — supaya percakapan kemarin tidak
 * dianggap nyambung ke hari ini), kalau ada pakai itu & muat pesannya; kalau
 * tidak ada baru buat baris baru. Aktivitas terakhir = pesan terakhir (atau
 * started_at bila belum ada pesan), supaya percakapan lama yang dilanjutkan
 * lewat "Riwayat" tetap terbuka setelah halaman dimuat ulang.
 */
const ACTIVE_CONVERSATION_WINDOW_HOURS = 12;

export interface ConversationSummary {
  id: string;
  startedAt: string;
  lastActivityAt: string;
  /** Potongan pesan pertama staf, dipakai sebagai judul di daftar riwayat. */
  title: string;
  messageCount: number;
}

export async function getOrCreateActiveConversation(
  supabase: SupabaseBrowserClient,
  businessId: string,
  staffId: string,
): Promise<{ conversationId: string; history: StoredChatMessage[] }> {
  const cutoff = Date.now() - ACTIVE_CONVERSATION_WINDOW_HOURS * 60 * 60 * 1000;

  // Biasanya hanya ada satu yang terbuka (Percakapan Baru & Lanjutkan menutup
  // yang lain); dibatasi beberapa baris untuk jaga-jaga data lama.
  const { data: open } = await supabase
    .from("agent_conversations")
    .select("id, started_at")
    .eq("staff_id", staffId)
    .eq("business_id", businessId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(5);

  const lastActivity = await getLastActivity(supabase, open ?? []);
  const active = (open ?? [])
    .map((c) => ({ id: c.id, at: lastActivity.get(c.id) ?? c.started_at }))
    .filter((c) => new Date(c.at).getTime() >= cutoff)
    .sort((a, b) => b.at.localeCompare(a.at))[0];

  if (active) {
    const history = await loadConversationHistory(supabase, active.id);
    return { conversationId: active.id, history };
  }

  const id = await createConversation(supabase, businessId, staffId);
  return { conversationId: id, history: [] };
}

export async function loadConversationHistory(
  supabase: SupabaseBrowserClient,
  conversationId: string,
): Promise<StoredChatMessage[]> {
  const query = (columns: string) =>
    supabase
      .from("agent_messages")
      .select(columns)
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"]) // pesan 'tool' sengaja tidak ditampilkan ke staf
      .order("created_at", { ascending: true })
      .returns<{ role: string; content: string | null; trace?: unknown }[]>();

  const withTrace = await query("role, content, trace");
  let data = withTrace.data;
  // Kolom trace baru ada setelah migrasi 0036; sebelum itu riwayat tetap harus tampil.
  if (withTrace.error) ({ data } = await query("role, content"));

  return (data ?? []).map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content ?? "",
    ...(Array.isArray(m.trace) && { trace: m.trace as ProcessStep[] }),
  }));
}

/**
 * Daftar percakapan staf ini di tenant aktif, terbaru dulu, untuk panel
 * "Riwayat". Percakapan tanpa pesan (mis. dibuat lalu langsung ditinggal lewat
 * Percakapan Baru) tidak ditampilkan.
 */
export async function listConversations(
  supabase: SupabaseBrowserClient,
  businessId: string,
  staffId: string,
  limit = 30,
): Promise<ConversationSummary[]> {
  const { data: convs } = await supabase
    .from("agent_conversations")
    .select("id, started_at")
    .eq("staff_id", staffId)
    .eq("business_id", businessId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (!convs || convs.length === 0) return [];

  const { data: msgs } = await supabase
    .from("agent_messages")
    .select("conversation_id, role, content, created_at")
    .in("conversation_id", convs.map((c) => c.id))
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  const byConv = new Map<string, { title: string; count: number; last: string }>();
  for (const m of msgs ?? []) {
    const entry = byConv.get(m.conversation_id) ?? { title: "", count: 0, last: m.created_at };
    entry.count += 1;
    entry.last = m.created_at;
    if (!entry.title && m.role === "user") entry.title = m.content ?? "";
    byConv.set(m.conversation_id, entry);
  }

  return convs
    .filter((c) => byConv.has(c.id))
    .map((c) => {
      const entry = byConv.get(c.id)!;
      return {
        id: c.id,
        startedAt: c.started_at,
        lastActivityAt: entry.last,
        title: entry.title.trim() || "Percakapan tanpa judul",
        messageCount: entry.count,
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
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
  if (currentConversationId) await closeConversation(supabase, currentConversationId);
  return createConversation(supabase, businessId, staffId);
}

/**
 * Dipanggil dari panel "Riwayat" — menutup percakapan yang sedang terbuka lalu
 * membuka lagi percakapan lama (ended_at dikosongkan) supaya pesan berikutnya
 * tersimpan ke sana dan tetap terbuka setelah halaman dimuat ulang.
 */
export async function resumeConversation(
  supabase: SupabaseBrowserClient,
  conversationId: string,
  currentConversationId: string | null,
): Promise<StoredChatMessage[]> {
  if (currentConversationId && currentConversationId !== conversationId) {
    await closeConversation(supabase, currentConversationId);
  }

  const { error } = await supabase
    .from("agent_conversations")
    .update({ ended_at: null })
    .eq("id", conversationId);
  if (error) throw new Error("Gagal membuka percakapan");

  return loadConversationHistory(supabase, conversationId);
}

async function closeConversation(supabase: SupabaseBrowserClient, conversationId: string) {
  await supabase
    .from("agent_conversations")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", conversationId);
}

async function createConversation(
  supabase: SupabaseBrowserClient,
  businessId: string,
  staffId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .insert({ business_id: businessId, staff_id: staffId, channel: "chat_pwa" })
    .select("id")
    .single();

  if (error || !data) throw new Error("Gagal membuat percakapan baru");
  return data.id;
}

/** Waktu pesan terakhir per percakapan (percakapan tanpa pesan tidak ada di map). */
async function getLastActivity(
  supabase: SupabaseBrowserClient,
  convs: { id: string }[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (convs.length === 0) return result;

  const { data } = await supabase
    .from("agent_messages")
    .select("conversation_id, created_at")
    .in("conversation_id", convs.map((c) => c.id))
    .order("created_at", { ascending: false });

  for (const m of data ?? []) {
    if (!result.has(m.conversation_id)) result.set(m.conversation_id, m.created_at);
  }
  return result;
}
