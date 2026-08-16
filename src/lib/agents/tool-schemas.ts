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
 * WebLLM). Nama & parameter HARUS sinkron dengan Route Handler di app/api/agent/tools/*.
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
        'Catat niat perubahan stok (barang masuk/keluar). TIDAK langsung mengubah stok — akan meminta konfirmasi PIN staf dulu (human-in-the-loop).',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'UUID produk, didapat dari hasil getStock' },
          location_id: { type: 'string', description: 'UUID lokasi (toko/gudang)' },
          quantity: { type: 'number', description: 'Jumlah unit' },
          direction: { type: 'string', enum: ['masuk', 'keluar'] },
          reasoning: { type: 'string', description: 'Alasan/ringkasan permintaan staf, untuk audit log' },
        },
        required: ['product_id', 'location_id', 'quantity', 'direction', 'reasoning'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transferStock',
      description: 'Catat niat transfer stok antar lokasi (toko <-> gudang). Butuh konfirmasi PIN staf.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string' },
          quantity: { type: 'number' },
          from_location_id: { type: 'string' },
          to_location_id: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['product_id', 'quantity', 'from_location_id', 'to_location_id', 'reasoning'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getSalesTrend',
      description: 'Ambil tren penjualan (transaksi keluar) bulanan untuk sebuah produk, N bulan terakhir.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string' },
          months: { type: 'number', description: 'Default 6' },
        },
        required: ['product_id'],
      },
    },
  },
] as const
