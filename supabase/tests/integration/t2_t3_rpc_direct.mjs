// T2/T3 — panggilan RPC langsung via PostgREST oleh `authenticated` (staf tenant A) dan `anon`.
// Hanya untuk instance Supabase LOKAL. Kunci dibaca dari .env.test.local (jangan di-commit).
// Pakai: node supabase/tests/integration/t2_t3_rpc_direct.mjs
// Sebelumnya: seed_eval.sql + fixture_tenant_b.sql sudah dimuat.
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(
  fs.readFileSync('.env.test.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1)]
  }),
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) throw new Error('Hanya untuk Supabase lokal')
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY

const A = {
  biz: 'e0000000-0000-0000-0000-00000000e001',
  prod: 'e0000000-0d0c-0000-0000-000000000001',
  gudang: 'e0000000-0ca0-0000-0000-000000000002',
  toko: 'e0000000-0ca0-0000-0000-000000000001',
  staff: 'e0000000-5a1f-0000-0000-000000000001',
}
const B = {
  biz: 'b0000000-0000-0000-0000-00000000b001',
  prod: 'b0000000-0d0c-0000-0000-000000000001',
  gudang: 'b0000000-0ca0-0000-0000-000000000001',
}

async function rest(key, method, p, body, extra = {}) {
  const r = await fetch(`${URL_}/${p}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, json }
}

const svcGet = (p) => rest(SVC, 'GET', `rest/v1/${p}`)
async function snapshot(auditIds = []) {
  const stk = async (prod, loc) => (await svcGet(`stock?product_id=eq.${prod}&location_id=eq.${loc}&select=quantity,reserved_quantity`)).json[0]
  const cnt = async (t, q = '') => {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=id${q}`, { headers: { apikey: ANON, Authorization: `Bearer ${SVC}`, Prefer: 'count=exact', Range: '0-0' } })
    return Number(r.headers.get('content-range').split('/')[1])
  }
  const audits = {}
  for (const id of auditIds) audits[id] = (await svcGet(`agent_audit_log?id=eq.${id}&select=status`)).json[0]?.status
  return {
    stockA_gudang: await stk(A.prod, A.gudang),
    stockA_toko: await stk(A.prod, A.toko),
    stockB: await stk(B.prod, B.gudang),
    txns: await cnt('stock_transactions'),
    sales: await cnt('sales'),
    counters: JSON.stringify((await svcGet('sale_counters?select=business_id,counter&order=business_id')).json),
    audits,
  }
}

async function newAudit(params, tool) {
  const r = await rest(SVC, 'POST', 'rest/v1/agent_audit_log', { business_id: A.biz, agent_type: 'stock', tool_name: tool, input_params: params, status: 'pending' }, { Prefer: 'return=representation' })
  return r.json[0].id
}

const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'eval-prima-motor.evaluator@staff.internal', password: env.EVAL_PIN }),
}).then((r) => r.json())
if (!login.access_token) throw new Error('Login evaluator gagal')
const roles = { authenticated: login.access_token, anon: ANON }

const rows = []
async function attack(role, name, fn, body, setup) {
  const ctx = (await setup?.()) ?? {}
  const before = await snapshot(ctx.audits ?? [])
  const res = await rest(roles[role], 'POST', `rest/v1/rpc/${fn}`, typeof body === 'function' ? body(ctx) : body)
  const after = await snapshot(ctx.audits ?? [])
  const changed = JSON.stringify(before) !== JSON.stringify(after)
  const diff = []
  for (const k of Object.keys(before)) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) diff.push(`${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`)
  rows.push({ test: name, role, rpc: fn, http: res.status, state_changed: changed, verdict: changed ? 'GAGAL (mutasi terjadi)' : 'LULUS (tidak ada mutasi)', response: JSON.stringify(res.json).slice(0, 160), diff: diff.join(' | ') })
  console.log(`${changed ? 'GAGAL' : 'lulus'}  [${role}] ${name}  http=${res.status}  ${JSON.stringify(res.json).slice(0, 100)}`)
}

for (const role of ['authenticated', 'anon']) {
  const T = role === 'authenticated' ? 'T2' : 'T3'
  await attack(role, `${T} confirm_update_stock (audit sah, staf sembarang)`, 'confirm_update_stock',
    (c) => ({ p_audit_log_id: c.id, p_staff_id: A.staff }),
    async () => { const id = await newAudit({ business_id: A.biz, product_id: A.prod, location_id: A.gudang, quantity: 1, direction: 'masuk' }, 'update_stock'); return { id, audits: [id] } })
  await attack(role, `${T} confirm_transfer_stock (audit sah)`, 'confirm_transfer_stock',
    (c) => ({ p_audit_log_id: c.id, p_staff_id: A.staff }),
    async () => { const id = await newAudit({ business_id: A.biz, product_id: A.prod, from_location_id: A.gudang, to_location_id: A.toko, quantity: 1 }, 'transfer_stock'); return { id, audits: [id] } })
  await attack(role, `${T} record_stock_transaction masuk +5 (tenant sendiri)`, 'record_stock_transaction',
    { p_business_id: A.biz, p_product_id: A.prod, p_location_id: A.gudang, p_type: 'masuk', p_quantity: 5, p_staff_id: A.staff })
  await attack(role, `${T} transfer_stock gudang->toko`, 'transfer_stock',
    { p_business_id: A.biz, p_product_id: A.prod, p_quantity: 1, p_from_location_id: A.gudang, p_to_location_id: A.toko, p_staff_id: A.staff })
  await attack(role, `${T} reserve_stock`, 'reserve_stock', { p_product_id: A.prod, p_location_id: A.gudang, p_quantity: 1 })
  await attack(role, `${T} release_reservation`, 'release_reservation', { p_product_id: A.prod, p_location_id: A.gudang, p_quantity: 1 },
    async () => { await rest(SVC, 'PATCH', `rest/v1/stock?product_id=eq.${A.prod}&location_id=eq.${A.gudang}`, { reserved_quantity: 1 }); return {} })
  await rest(SVC, 'PATCH', `rest/v1/stock?product_id=eq.${A.prod}&location_id=eq.${A.gudang}`, { reserved_quantity: 0 })
  await attack(role, `${T}b record_sale tenant sendiri (SECURITY DEFINER)`, 'record_sale',
    { p_business_id: A.biz, p_location_id: A.gudang, p_staff_id: A.staff, p_items: [{ product_id: A.prod, quantity: 1 }], p_payment_method: 'cash', p_amount_paid: 1000000 })
  await attack(role, `${T}b record_sale LINTAS TENANT ke tenant B`, 'record_sale',
    { p_business_id: B.biz, p_location_id: B.gudang, p_staff_id: A.staff, p_items: [{ product_id: B.prod, quantity: 1 }], p_payment_method: 'cash', p_amount_paid: 1000000 })
  await attack(role, `${T}b next_sale_number tenant B (SECURITY DEFINER)`, 'next_sale_number', { p_business_id: B.biz })
  await attack(role, `${T}b approve_business_signup`, 'approve_business_signup', { p_business_id: B.biz })
}

// T3 — tabel tanpa RLS: sale_counters ditulis langsung
for (const role of ['authenticated', 'anon']) {
  await rest(SVC, 'PATCH', `rest/v1/sale_counters?business_id=eq.${B.biz}`, { counter: 1 })
  const before = await snapshot()
  const res = await rest(roles[role], 'PATCH', `rest/v1/sale_counters?business_id=eq.${B.biz}`, { counter: 999999 }, { Prefer: 'return=representation' })
  const after = await snapshot()
  const changed = before.counters !== after.counters
  rows.push({ test: `T3c PATCH langsung sale_counters (RLS mati)`, role, rpc: 'PATCH /sale_counters', http: res.status, state_changed: changed, verdict: changed ? 'GAGAL (mutasi terjadi)' : 'LULUS (tidak ada mutasi)', response: JSON.stringify(res.json).slice(0, 160), diff: changed ? `${before.counters} -> ${after.counters}` : '' })
  console.log(`${changed ? 'GAGAL' : 'lulus'}  [${role}] PATCH sale_counters http=${res.status}`)
}

await rest(SVC, 'DELETE', `rest/v1/sale_counters?business_id=eq.${B.biz}`)
const out = path.join('supabase', 'tests', 'integration', 'results')
fs.mkdirSync(out, { recursive: true })
const cols = ['test', 'role', 'rpc', 'http', 'state_changed', 'verdict', 'response', 'diff']
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
fs.writeFileSync(path.join(out, 't2_t3_rpc_direct.csv'), [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'))
console.log(`\nCSV: ${path.join(out, 't2_t3_rpc_direct.csv')}`)
