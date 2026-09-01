import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Dipakai oleh GET .../shifts/[id]/report (X report, shift boleh masih
 * terbuka) DAN POST .../shifts/[id]/close (Z report, dipanggil sesaat
 * sebelum shift dikunci) — satu sumber perhitungan supaya angka X dan Z
 * konsisten persis kalau dipanggil di momen yang sama.
 *
 * Berbasis rentang waktu (created_at antara opened_at dan endTime), BUKAN
 * kolom shift_id di sales — lihat catatan di migration 0029 soal trade-off
 * pendekatan ini.
 */
export interface ShiftReportTotals {
  salesCount: number
  grossRevenue: number
  voidCount: number
  voidTotalAmount: number
  cashTotal: number
  transferTotal: number
  qrisTotal: number
  cardTotal: number
  piutangTotal: number
  expectedCash: number
}

export async function computeShiftReportTotals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tipe Database generik belum tersambung (§15.2), konsisten dgn pola supabase client di route lain
  supabase: SupabaseClient<any>,
  params: { businessId: string; staffId: string; locationId: string; openingCash: number; fromISO: string; toISO: string },
): Promise<ShiftReportTotals> {
  const { businessId, staffId, locationId, openingCash, fromISO, toISO } = params

  const { data: sales } = await supabase
    .from('sales')
    .select('id, total_amount, status, payment_method')
    .eq('business_id', businessId)
    .eq('staff_id', staffId)
    .eq('location_id', locationId)
    .gte('created_at', fromISO)
    .lte('created_at', toISO)

  const completed = (sales ?? []).filter((s) => s.status === 'completed')
  const voided = (sales ?? []).filter((s) => s.status === 'voided')
  const piutangTotal = completed.filter((s) => s.payment_method === 'piutang').reduce((sum, s) => sum + s.total_amount, 0)

  const completedSaleIds = completed.filter((s) => s.payment_method !== 'piutang').map((s) => s.id)
  const { data: payments } = completedSaleIds.length
    ? await supabase.from('sale_payments').select('sale_id, payment_method, amount').in('sale_id', completedSaleIds)
    : { data: [] as { sale_id: string; payment_method: string; amount: number }[] }

  const totalsByMethod = { cash: 0, transfer: 0, qris: 0, card: 0 }
  for (const p of payments ?? []) {
    if (p.payment_method in totalsByMethod) {
      totalsByMethod[p.payment_method as keyof typeof totalsByMethod] += p.amount
    }
  }

  return {
    salesCount: completed.length,
    grossRevenue: completed.reduce((sum, s) => sum + s.total_amount, 0),
    voidCount: voided.length,
    voidTotalAmount: voided.reduce((sum, s) => sum + s.total_amount, 0),
    cashTotal: totalsByMethod.cash,
    transferTotal: totalsByMethod.transfer,
    qrisTotal: totalsByMethod.qris,
    cardTotal: totalsByMethod.card,
    piutangTotal,
    expectedCash: openingCash + totalsByMethod.cash,
  }
}
