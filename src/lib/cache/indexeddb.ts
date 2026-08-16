import Dexie, { type Table } from 'dexie'
import type { createClient } from '@/lib/supabase/client'

export interface CachedStock {
  product_id: string
  location_id: string
  business_id: string
  product_name: string
  quantity: number
  available_quantity: number
  last_synced_at: string
}

export interface CachedConversationMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  created_at: string
  pending_sync: boolean // true kalau dibuat offline & belum ter-flush ke agent_messages
}

class AppCache extends Dexie {
  stock!: Table<CachedStock, [string, string]>
  pendingMessages!: Table<CachedConversationMessage, string>

  constructor() {
    super('prima-motor-cache')
    this.version(1).stores({
      stock: '[product_id+location_id], business_id, product_name',
      pendingMessages: 'id, conversation_id, pending_sync',
    })
  }
}

export const cache = new AppCache()

/**
 * Sinkronisasi cache stok lokal. Dipanggil saat online (mount chat page, atau
 * event 'online' browser). Query Agent baca dari cache dulu (offline-tolerant,
 * §1 prinsip #4 desain database), fallback ke Supabase langsung kalau online.
 */
export async function syncStockCache(
  supabase: ReturnType<typeof createClient>,
  businessId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('stock')
    .select('product_id, location_id, business_id, quantity, available_quantity, last_updated_at, products(name)')
    .eq('business_id', businessId)

  if (error || !data) return

  const rows: CachedStock[] = data.map((row) => ({
    product_id: row.product_id,
    location_id: row.location_id,
    business_id: row.business_id,
    // @ts-expect-error -- join shape tergantung tipe generate Supabase, aman secara runtime
    product_name: row.products?.name ?? '',
    quantity: row.quantity,
    available_quantity: row.available_quantity,
    last_synced_at: new Date().toISOString(),
  }))

  await cache.stock.bulkPut(rows)
}

export async function searchCachedStock(query: string, businessId: string): Promise<CachedStock[]> {
  const q = query.trim().toLowerCase()
  return cache.stock
    .where('business_id')
    .equals(businessId)
    .filter((row) => row.product_name.toLowerCase().includes(q))
    .toArray()
}

/**
 * Sebelumnya tabel `pendingMessages` didefinisikan tapi tidak pernah diisi/dibaca
 * di mana pun — jadi klaim "offline-tolerant" untuk histori chat belum benar-benar
 * berfungsi. Dua fungsi ini menutup gap itu: simpan pesan yang gagal terkirim
 * (biasanya karena offline) ke IndexedDB, lalu kirim ulang begitu koneksi kembali.
 */
export async function queuePendingMessage(msg: Omit<CachedConversationMessage, 'id' | 'pending_sync'>): Promise<void> {
  await cache.pendingMessages.put({
    ...msg,
    id: crypto.randomUUID(),
    pending_sync: true,
  })
}

export async function getPendingMessages(conversationId: string): Promise<CachedConversationMessage[]> {
  return cache.pendingMessages.where('conversation_id').equals(conversationId).sortBy('created_at')
}

/**
 * Kirim ulang semua pesan yang tertunda ke Supabase (dipanggil saat event 'online'
 * browser, atau saat mount kalau ternyata sudah online). Sukses per-pesan dihapus
 * dari antrean satu-satu — kalau tengah proses gagal lagi (mis. sinyal putus-nyambung),
 * sisanya tetap aman tersimpan untuk dicoba lagi nanti, tidak hilang.
 */
export async function flushPendingMessages(
  supabase: ReturnType<typeof createClient>,
  onFlushed?: (msg: CachedConversationMessage) => void
): Promise<{ flushed: number; remaining: number }> {
  const rows = (await cache.pendingMessages.toArray()).filter((m) => m.pending_sync)

  let flushed = 0
  for (const msg of rows) {
    const { error } = await supabase
      .from('agent_messages')
      .insert({ conversation_id: msg.conversation_id, role: msg.role, content: msg.content })
    if (error) continue // masih gagal (masih offline?) — biarkan di antrean, coba lagi nanti

    await cache.pendingMessages.delete(msg.id)
    onFlushed?.(msg)
    flushed += 1
  }

  const remaining = await cache.pendingMessages.count()
  return { flushed, remaining }
}
