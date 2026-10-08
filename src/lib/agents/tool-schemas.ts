import { z } from 'zod'

/**
 * Skema Zod tunggal untuk tiap tool. Dipakai dua kali:
 *  1. Diserialisasi ke JSON Schema untuk function-calling WebLLM (lihat tool-defs.ts)
 *  2. Divalidasi ulang di Route Handler (server) — TIDAK PERNAH percaya input dari
 *     browser meski sudah "divalidasi" agent, karena browser bisa dimanipulasi.
 */

export const getStockSchema = z.object({
  business_id: z.string().uuid(),
  query: z.string().min(1, 'Query pencarian tidak boleh kosong'),
  limit: z.number().int().min(1).max(20).default(5),
})
export type GetStockInput = z.infer<typeof getStockSchema>

export const updateStockSchema = z.object({
  business_id: z.string().uuid(),
  product_id: z.string().uuid(),
  location_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  direction: z.enum(['masuk', 'keluar']),
  conversation_id: z.string().uuid(),
  reasoning: z.string().min(1, 'decision_reason wajib diisi untuk audit trail'),
})
export type UpdateStockInput = z.infer<typeof updateStockSchema>

export const updateStockConfirmSchema = z.object({
  audit_log_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  business_slug: z.string().min(1),
  username: z.string().min(1),
  pin: z.string().min(6),
})
export type UpdateStockConfirmInput = z.infer<typeof updateStockConfirmSchema>

export const transferStockSchema = z.object({
  business_id: z.string().uuid(),
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  from_location_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  reasoning: z.string().min(1),
}).refine((data) => data.from_location_id !== data.to_location_id, {
  message: 'Lokasi asal dan tujuan tidak boleh sama',
  path: ['to_location_id'],
})
export type TransferStockInput = z.infer<typeof transferStockSchema>

export const transferStockConfirmSchema = updateStockConfirmSchema

export const getSalesTrendSchema = z.object({
  product_id: z.string().uuid(),
  months: z.number().int().min(1).max(24).default(6),
})
export type GetSalesTrendInput = z.infer<typeof getSalesTrendSchema>

export const createReorderSuggestionSchema = z.object({
  business_id: z.string().uuid(),
  product_id: z.string().uuid(),
  suggested_quantity: z.number().int().positive(),
  reason: z.string().min(1),
  trend_snapshot: z.record(z.unknown()).optional(),
  suggested_supplier_id: z.string().uuid().optional(),
})
export type CreateReorderSuggestionInput = z.infer<typeof createReorderSuggestionSchema>

/**
 * Deskripsi tool dalam format function-calling (OpenAI-compatible, yang juga dipakai
 * WebLLM). getStock sinkron dengan Route Handler. updateStock, transferStock, dan
 * getSalesTrend sengaja memakai NAMA barang/lokasi (satu langkah untuk model kecil;
 * Run 30: model 3B tidak merangkai getStock → getSalesTrend);
 * orchestrator memetakannya ke product_id/location_id sebelum memanggil Route Handler,
 * yang tetap memvalidasi UUID lewat skema Zod di atas.
 */
export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'getStock',
      description:
        'Cari produk/suku cadang berdasarkan nama atau istilah informal (mis. "karbu", "bohlam sein"), lalu kembalikan stok terkini per lokasi. Toleran typo.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nama part atau istilah pencarian dari staf' },
          limit: { type: 'number', description: 'Maksimum hasil, default 5' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateStock',
      description:
        'Catat niat barang masuk/keluar. Sistem yang mencari barangnya dan mengecek stok. TIDAK langsung mengubah stok — sistem meminta konfirmasi PIN staf dulu (human-in-the-loop).',
      parameters: {
        type: 'object',
        properties: {
          product: { type: 'string', description: 'Nama barang persis seperti ditulis staf (boleh singkatan/typo)' },
          quantity: { type: 'number', description: 'Jumlah unit dari pesan staf' },
          direction: { type: 'string', enum: ['masuk', 'keluar'] },
          location: {
            type: 'string',
            description: 'Lokasi yang disebut staf, mis. "toko" atau "gudang". Kosongkan kalau staf tidak menyebut lokasi — sistem akan menanyakannya.',
          },
          reasoning: { type: 'string', description: 'Ringkasan permintaan staf, untuk audit log' },
        },
        required: ['product', 'quantity', 'direction', 'reasoning'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transferStock',
      description: 'Catat niat pindah stok antar lokasi (toko <-> gudang). Sistem yang mencari barangnya. Butuh konfirmasi PIN staf.',
      parameters: {
        type: 'object',
        properties: {
          product: { type: 'string', description: 'Nama barang persis seperti ditulis staf' },
          quantity: { type: 'number', description: 'Jumlah unit' },
          from_location: { type: 'string', description: 'Lokasi asal, mis. "gudang"' },
          to_location: { type: 'string', description: 'Lokasi tujuan, mis. "toko"' },
          reasoning: { type: 'string', description: 'Ringkasan permintaan staf, untuk audit log' },
        },
        required: ['product', 'quantity', 'from_location', 'to_location', 'reasoning'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getSalesTrend',
      description:
        'Ambil tren penjualan (transaksi keluar) bulanan sebuah barang, N bulan terakhir. Sistem yang mencari barangnya; tidak perlu getStock dulu.',
      parameters: {
        type: 'object',
        properties: {
          product: { type: 'string', description: 'Nama barang persis seperti ditulis staf (boleh singkatan/typo)' },
          months: { type: 'number', description: 'Jumlah bulan dari pesan staf, default 6' },
        },
        required: ['product'],
      },
    },
  },
] as const
