import Dexie, { type Table } from "dexie";
import type { createClient } from "@/src/lib/supabase/client";
import type { Database, Json } from "@/src/lib/db/types";

type AgentMessageInsert = Database["public"]["Tables"]["agent_messages"]["Insert"];
import type { ProcessStep } from "@/src/lib/agents/process-trace";

export interface CachedStock {
  product_id: string;
  location_id: string;
  business_id: string;
  product_name: string;
  /** Nama lokasi (Toko/Gudang) supaya jawaban offline tidak menyebut UUID. Bukan kolom indeks. */
  location_name?: string;
  quantity: number;
  available_quantity: number;
  last_synced_at: string;
}

export interface CachedConversationMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  created_at: string;
  pending_sync: boolean; // true kalau dibuat offline & belum ter-flush ke agent_messages
  /** Staf pemilik pesan; antrean hanya dikirim saat staf yang sama login. Bukan kolom indeks. */
  staff_id?: string;
  /** Langkah "Lihat proses" pesan asisten; ikut terkirim saat flush. Bukan kolom indeks. */
  trace?: ProcessStep[];
}

class AppCache extends Dexie {
  stock!: Table<CachedStock, [string, string]>;
  pendingMessages!: Table<CachedConversationMessage, string>;

  constructor() {
    super("prima-motor-cache");
    this.version(1).stores({
      stock: "[product_id+location_id], business_id, product_name",
      pendingMessages: "id, conversation_id, pending_sync",
    });
  }
}

export const cache = new AppCache();

/**
 * Sinkronisasi cache stok lokal. Dipanggil saat online (mount chat page, atau
 * event 'online' browser). Query Agent baca dari cache dulu (offline-tolerant,
 * §1 prinsip #4 desain database), fallback ke Supabase langsung kalau online.
 */
export async function syncStockCache(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
): Promise<{ ok: true; syncedAt: string; rows: number } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("stock")
    .select(
      "product_id, location_id, business_id, quantity, available_quantity, last_updated_at, products(name), locations(name)",
    )
    .eq("business_id", businessId);

  if (error || !data) return { ok: false, error: error?.message ?? "Data stok kosong" };
  const syncedAt = new Date().toISOString();

  const rows: CachedStock[] = data.map((row) => ({
    product_id: row.product_id,
    location_id: row.location_id,
    business_id: row.business_id,
    // @ts-expect-error -- join shape tergantung tipe generate Supabase, aman secara runtime
    product_name: row.products?.name ?? "",
    // @ts-expect-error -- sama seperti products di atas
    location_name: row.locations?.name ?? undefined,
    quantity: row.quantity,
    available_quantity: row.available_quantity,
    last_synced_at: syncedAt,
  }));

  // Ganti isi cache sepenuhnya: baris tenant lain (perangkat dipakai bergantian)
  // dan produk yang sudah tidak ada di server tidak boleh tersisa di perangkat.
  await cache.transaction("rw", cache.stock, async () => {
    await cache.stock.clear();
    await cache.stock.bulkPut(rows);
  });
  return { ok: true, syncedAt, rows: rows.length };
}

/** Waktu sinkron terakhir cache stok tenant ini di perangkat, null bila belum pernah. */
export async function getLastStockSync(businessId: string): Promise<string | null> {
  const rows = await cache.stock.where("business_id").equals(businessId).toArray();
  return rows.reduce<string | null>((max, r) => (max === null || r.last_synced_at > max ? r.last_synced_at : max), null);
}

/**
 * Dipanggil saat logout supaya data stok tidak tertinggal di perangkat.
 * pendingMessages sengaja tidak dihapus: isinya pesan yang belum terkirim.
 */
export async function clearStockCache(): Promise<void> {
  await cache.stock.clear();
}

export async function searchCachedStock(
  query: string,
  businessId: string,
): Promise<CachedStock[]> {
  const q = query.trim().toLowerCase();
  return cache.stock
    .where("business_id")
    .equals(businessId)
    .filter((row) => row.product_name.toLowerCase().includes(q))
    .toArray();
}

/**
 * Sebelumnya tabel `pendingMessages` didefinisikan tapi tidak pernah diisi/dibaca
 * di mana pun — jadi klaim "offline-tolerant" untuk histori chat belum benar-benar
 * berfungsi. Dua fungsi ini menutup gap itu: simpan pesan yang gagal terkirim
 * (biasanya karena offline) ke IndexedDB, lalu kirim ulang begitu koneksi kembali.
 */
export async function queuePendingMessage(
  msg: Omit<CachedConversationMessage, "id" | "pending_sync">,
): Promise<void> {
  await cache.pendingMessages.put({
    ...msg,
    id: crypto.randomUUID(),
    pending_sync: true,
  });
}

export async function getPendingMessages(
  conversationId: string,
): Promise<CachedConversationMessage[]> {
  return cache.pendingMessages
    .where("conversation_id")
    .equals(conversationId)
    .sortBy("created_at");
}

/**
 * Kirim ulang semua pesan yang tertunda ke Supabase (dipanggil saat event 'online'
 * browser, atau saat mount kalau ternyata sudah online). Sukses per-pesan dihapus
 * dari antrean satu-satu — kalau tengah proses gagal lagi (mis. sinyal putus-nyambung),
 * sisanya tetap aman tersimpan untuk dicoba lagi nanti, tidak hilang.
 */
let flushInFlight: Promise<{ flushed: number; remaining: number }> | null = null;

/**
 * Hanya satu flush berjalan sekaligus (effect mount + event online, dan
 * StrictMode di dev, bisa memanggilnya bersamaan → pesan terkirim dua kali).
 */
export function flushPendingMessages(
  supabase: ReturnType<typeof createClient>,
  staffId: string,
  onFlushed?: (msg: CachedConversationMessage) => void,
): Promise<{ flushed: number; remaining: number }> {
  flushInFlight ??= flushPendingMessagesOnce(supabase, staffId, onFlushed).finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

/** Pesan antrean yang boleh dikirim staf ini (baris lama tanpa staff_id ikut, demi tidak hilang). */
export function pendingForStaff(rows: CachedConversationMessage[], staffId: string) {
  return rows
    .filter((m) => m.pending_sync && (m.staff_id === undefined || m.staff_id === staffId))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function flushPendingMessagesOnce(
  supabase: ReturnType<typeof createClient>,
  staffId: string,
  onFlushed?: (msg: CachedConversationMessage) => void,
): Promise<{ flushed: number; remaining: number }> {
  // Urut waktu dibuat: id antrean acak, dan tanpa ini pasangan pesan staf/asisten
  // bisa tersimpan terbalik di server.
  const rows = pendingForStaff(await cache.pendingMessages.toArray(), staffId);

  let flushed = 0;
  for (const msg of rows) {
    // created_at dari perangkat ikut dikirim supaya urutan riwayat sama dengan saat diketik.
    const row: AgentMessageInsert = { conversation_id: msg.conversation_id, role: msg.role, content: msg.content, created_at: msg.created_at };
    const withTrace: AgentMessageInsert = msg.trace ? { ...row, trace: msg.trace as unknown as Json } : row;
    let { error } = await supabase.from("agent_messages").insert(withTrace);
    // Kolom trace belum ada (migrasi 0036 belum jalan): pesannya tetap dikirim tanpa trace.
    if (error && msg.trace) ({ error } = await supabase.from("agent_messages").insert(row));
    // Masih gagal (masih offline?): berhenti di sini supaya urutan tetap terjaga; sisanya dicoba lagi nanti.
    if (error) break;

    await cache.pendingMessages.delete(msg.id);
    onFlushed?.(msg);
    flushed += 1;
  }

  const remaining = await cache.pendingMessages.count();
  return { flushed, remaining };
}
