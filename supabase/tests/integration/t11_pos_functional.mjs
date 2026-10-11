// T11 — regresi fungsional POS setelah migrasi 0038 (jalur sah: service_role).
// record_sale: stok turun tepat sebanyak qty (bukan 2x); void_sale: kembali tepat qty;
// claim_warranty_return (replaced): stok naik tepat qty. Lokal saja.
import { A, B, svc, rest, SVC, login, writeCsv } from './_lib.mjs'

const rows = []
const rec = (op, harap, aktual, ok) => {
  rows.push({ test: 'T11', operasi: op, diharapkan: harap, aktual, verdict: ok ? 'LULUS' : 'GAGAL' })
  console.log(`${ok ? 'lulus' : 'GAGAL'}  ${op} | harap: ${harap} | aktual: ${aktual}`)
}
const rpc = (key, fn, body) => rest(key, 'POST', `rest/v1/rpc/${fn}`, body)
const qty = async (prod, loc) => (await svc('GET', `stock?product_id=eq.${prod}&location_id=eq.${loc}&select=quantity`)).json[0]?.quantity

// jalur sah: service_role
const q0 = await qty(A.prod, A.toko)
const sale = await rpc(SVC, 'record_sale', {
  p_business_id: A.biz, p_location_id: A.toko, p_staff_id: A.staff,
  p_items: [{ product_id: A.prod, quantity: 2 }], p_payment_method: 'cash',
  p_payments: [{ method: 'cash', amount: 10000000 }],
})
const q1 = await qty(A.prod, A.toko)
rec('record_sale 2 unit (service_role)', 'ok=true; stok -2', `http=${sale.status} ok=${sale.json?.ok}; stok ${q0}->${q1}`, sale.json?.ok === true && q0 - q1 === 2)

const txn = (await svc('GET', `stock_transactions?business_id=eq.${A.biz}&notes=like.*${sale.json?.sale_number}*&select=quantity,unit_price,total_value`)).json[0]
rec('total_value terisi otomatis', 'quantity*unit_price', JSON.stringify(txn), txn && Number(txn.total_value) === Number(txn.quantity) * Number(txn.unit_price))

const voided = await rpc(SVC, 'void_sale', { p_sale_id: sale.json?.sale_id, p_staff_id: A.owner, p_staff_role: 'owner', p_reason: 'tes integrasi' })
const q2 = await qty(A.prod, A.toko)
rec('void_sale (service_role)', 'ok=true; stok +2 (kembali ke awal)', `http=${voided.status} ok=${voided.json?.ok}; stok ${q1}->${q2}`, voided.json?.ok === true && q2 === q0)

// klaim garansi (replaced) pada nota baru; produk perlu warranty_days
await svc('PATCH', `products?id=eq.${A.prod}`, { warranty_days: 30 })
const sale2 = await rpc(SVC, 'record_sale', {
  p_business_id: A.biz, p_location_id: A.toko, p_staff_id: A.staff,
  p_items: [{ product_id: A.prod, quantity: 1 }], p_payment_method: 'cash', p_payments: [{ method: 'cash', amount: 10000000 }],
})
const itemId = (await svc('GET', `sale_items?sale_id=eq.${sale2.json?.sale_id}&select=id`)).json[0]?.id
const q3 = await qty(A.prod, A.toko)
const claim = await rpc(SVC, 'claim_warranty_return', { p_business_id: A.biz, p_sale_item_id: itemId, p_staff_id: A.owner, p_reason: 'tes', p_resolution: 'replaced' })
const q4 = await qty(A.prod, A.toko)
rec('claim_warranty_return replaced (service_role)', 'ok=true; stok +1', `http=${claim.status} ok=${claim.json?.ok} ${JSON.stringify(claim.json).slice(0, 80)}; stok ${q3}->${q4}`, claim.json?.ok === true && q4 - q3 === 1)

await svc('PATCH', `products?id=eq.${A.prod}`, { warranty_days: null })

// jalur terlarang: anon & authenticated harus ditolak di tingkat izin fungsi
const tok = await login('evaluator')
const ANON = (await import('./_lib.mjs')).ANON
for (const [role, key] of [['authenticated', tok], ['anon', ANON]]) {
  const before = await qty(B.prod, B.gudang)
  const r = await rpc(key, 'record_sale', {
    p_business_id: B.biz, p_location_id: B.gudang, p_staff_id: A.staff,
    p_items: [{ product_id: B.prod, quantity: 1 }], p_payment_method: 'cash', p_payments: [{ method: 'cash', amount: 1000000 }],
  })
  const after = await qty(B.prod, B.gudang)
  rec(`record_sale LINTAS TENANT oleh ${role}`, 'ditolak (permission denied); stok B tidak berubah', `http=${r.status} ${JSON.stringify(r.json).slice(0, 70)}; stok B ${before}->${after}`, r.status >= 400 && before === after)
  const n = await rpc(key, 'next_sale_number', { p_business_id: B.biz })
  rec(`next_sale_number tenant B oleh ${role}`, 'ditolak', `http=${n.status}`, n.status >= 400)
}
for (const [role, key] of [['authenticated', tok], ['anon', ANON]]) {
  await svc('POST', 'sale_counters', { business_id: B.biz, year: 2026, counter: 1 }, { Prefer: 'resolution=merge-duplicates' })
  const r = await rest(key, 'PATCH', `rest/v1/sale_counters?business_id=eq.${B.biz}`, { counter: 999999 }, { Prefer: 'return=representation' })
  const c = (await svc('GET', `sale_counters?business_id=eq.${B.biz}&select=counter`)).json[0]?.counter
  rec(`PATCH sale_counters oleh ${role}`, 'ditolak/tak berubah', `http=${r.status}; counter=${c}`, c === 1)
}
await svc('DELETE', `sale_counters?business_id=eq.${B.biz}`)

writeCsv('t11_pos_functional.csv', rows)
