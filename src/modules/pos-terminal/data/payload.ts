export type PaymentMethod = 'cash' | 'transfer' | 'qris' | 'card'
export type SaleSummaryPaymentMethod = PaymentMethod | 'split' | 'piutang'

export interface CartItemPayload {
  product_id: string
  quantity: number
  discount_amount?: number
  // TIDAK ADA unit_price — server selalu ambil dari katalog (products.selling_price),
  // lihat catatan keamanan di migration 0026_pos_security_hardening.sql. Harga
  // yang ditampilkan di keranjang (CartLine.unitPrice di Component.tsx) murni
  // buat preview UI sebelum checkout, bukan yang dikirim/dipercaya server.
}

export interface PaymentLinePayload {
  method: PaymentMethod
  amount: number
}

/**
 * idempotency_key dibuat di Component.tsx sekali per sesi checkout (bukan di
 * sini) — kalau POST gagal karena jaringan lalu staf klik "Bayar" lagi, key
 * yang sama dikirim ulang sehingga record_sale (migration 0025) mengembalikan
 * nota yang sama alih-alih dobel-catat. Key baru dibuat lagi hanya setelah
 * checkout SUKSES & keranjang dikosongkan untuk transaksi berikutnya.
 *
 * `payments` (migration 0027) mendukung split payment — kosongkan & isi
 * `customer_id` saja kalau payment_method='piutang'.
 */
export interface CheckoutPayload {
  location_id: string
  items: CartItemPayload[]
  payment_method: SaleSummaryPaymentMethod
  payments?: PaymentLinePayload[]
  customer_id?: string
  discount_amount?: number
  tax_amount?: number
  customer_name?: string
  customer_phone?: string
  notes?: string
  idempotency_key: string
}
