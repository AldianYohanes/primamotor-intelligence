// T1 (lintas tenant lewat PostgREST) dan T9 (eskalasi role staf). Lokal saja.
import { A, B, svc, rest, login, writeCsv } from './_lib.mjs'

const tokA = await login('evaluator') // staf tenant A
const tokOwner = await login('owner') // owner tenant A
const rows = []
const rec = (t, role, op, http, ok, detail) => {
  rows.push({ test: t, role, operasi: op, http, verdict: ok ? 'LULUS' : 'GAGAL', detail })
  console.log(`${ok ? 'lulus' : 'GAGAL'}  ${t} [${role}] ${op} http=${http} ${detail}`)
}

// --- data tenant B lewat service role
await svc('POST', 'agent_conversations', { id: 'b0000000-c0c0-0000-0000-000000000001', business_id: B.biz }, { Prefer: 'resolution=ignore-duplicates' })
const audB = (await svc('POST', 'agent_audit_log', { business_id: B.biz, agent_type: 'stock', tool_name: 'update_stock', input_params: { x: 1 }, status: 'pending' }, { Prefer: 'return=representation' })).json[0]?.id
await svc('POST', 'stock_transactions', { business_id: B.biz, product_id: B.prod, location_id: B.gudang, transaction_type: 'masuk', quantity: 1 })
const bStock = async () => (await svc('GET', `stock?product_id=eq.${B.prod}&select=quantity`)).json[0]?.quantity

// --- T1 baca: kontrol positif (A melihat A) dan lintas tenant (A melihat B)
for (const t of ['stock', 'stock_transactions', 'agent_audit_log', 'agent_conversations', 'products', 'locations', 'sales']) {
  const own = await rest(tokA, 'GET', `rest/v1/${t}?business_id=eq.${A.biz}&select=business_id&limit=1`)
  const oth = await rest(tokA, 'GET', `rest/v1/${t}?business_id=eq.${B.biz}&select=business_id`)
  const ownN = Array.isArray(own.json) ? own.json.length : -1
  const othN = Array.isArray(oth.json) ? oth.json.length : -1
  rec('T1 baca', 'authenticated A', `GET ${t} tenant B (kontrol: tenant A=${ownN} baris)`, oth.status, othN === 0, `baris tenant B terlihat=${othN}`)
}

// --- T1 tulis lintas tenant
const before = await bStock()
let r = await rest(tokA, 'PATCH', `rest/v1/stock?product_id=eq.${B.prod}`, { quantity: 999 }, { Prefer: 'return=representation' })
rec('T1 tulis', 'authenticated A', 'PATCH stock tenant B', r.status, (await bStock()) === before, `qty ${before} -> ${await bStock()}`)
r = await rest(tokA, 'POST', 'rest/v1/stock_transactions', { business_id: B.biz, product_id: B.prod, location_id: B.gudang, transaction_type: 'masuk', quantity: 50 })
rec('T1 tulis', 'authenticated A', 'INSERT stock_transactions tenant B', r.status, r.status >= 400, JSON.stringify(r.json).slice(0, 90))
r = await rest(tokA, 'POST', 'rest/v1/agent_audit_log', { business_id: B.biz, agent_type: 'stock', tool_name: 'x', input_params: {}, status: 'pending' })
rec('T1 tulis', 'authenticated A', 'INSERT agent_audit_log tenant B', r.status, r.status >= 400, JSON.stringify(r.json).slice(0, 90))
r = await rest(tokA, 'PATCH', `rest/v1/agent_audit_log?id=eq.${audB}`, { status: 'executed' }, { Prefer: 'return=representation' })
const stAud = (await svc('GET', `agent_audit_log?id=eq.${audB}&select=status`)).json[0]?.status
rec('T1 tulis', 'authenticated A', 'PATCH agent_audit_log tenant B', r.status, stAud === 'pending', `status=${stAud}`)
r = await rest(tokA, 'DELETE', `rest/v1/products?id=eq.${B.prod}`, undefined, { Prefer: 'return=representation' })
const prodLeft = (await svc('GET', `products?id=eq.${B.prod}&select=id`)).json.length
rec('T1 tulis', 'authenticated A', 'DELETE products tenant B', r.status, prodLeft === 1, `produk tersisa=${prodLeft}`)
r = await rest(tokA, 'PATCH', `rest/v1/products?id=eq.${B.prod}`, { name: 'DIRETAS' }, { Prefer: 'return=representation' })
const nm = (await svc('GET', `products?id=eq.${B.prod}&select=name`)).json[0]?.name
rec('T1 tulis', 'authenticated A', 'PATCH products tenant B', r.status, nm !== 'DIRETAS', `name=${nm}`)

// --- T9 eskalasi role (migrasi 0034)
const staffRow = async (id) => (await svc('GET', `staff?id=eq.${id}&select=role,is_active,username,business_id,auth_user_id`)).json[0]
const snapOwner = await staffRow(A.owner)
const snapStaff = await staffRow(A.staff)
const attempt = async (label, tok, role, id, patch, field) => {
  const b = await staffRow(id)
  const res = await rest(tok, 'PATCH', `rest/v1/staff?id=eq.${id}`, patch, { Prefer: 'return=representation' })
  const a = await staffRow(id)
  rec('T9', role, label, res.status, JSON.stringify(a[field]) === JSON.stringify(b[field]), `${field}: ${JSON.stringify(b[field])} -> ${JSON.stringify(a[field])} ${res.status >= 400 ? JSON.stringify(res.json).slice(0, 70) : ''}`)
}
await attempt('owner PATCH role dirinya -> admin', tokOwner, 'owner A', A.owner, { role: 'admin' }, 'role')
await svc('PATCH', `staff?id=eq.${A.owner}`, { role: snapOwner.role })
await attempt('owner PATCH role staf lain -> admin', tokOwner, 'owner A', A.staff, { role: 'admin' }, 'role')
await svc('PATCH', `staff?id=eq.${A.staff}`, { role: snapStaff.role })
await attempt('staf PATCH role dirinya -> owner', tokA, 'staf A', A.staff, { role: 'owner' }, 'role')
await svc('PATCH', `staff?id=eq.${A.staff}`, { role: snapStaff.role })
await attempt('owner PATCH business_id staf -> tenant B', tokOwner, 'owner A', A.staff, { business_id: B.biz }, 'business_id')
await svc('PATCH', `staff?id=eq.${A.staff}`, { business_id: A.biz })
await attempt('owner PATCH auth_user_id staf', tokOwner, 'owner A', A.staff, { auth_user_id: '00000000-0000-0000-0000-000000000099' }, 'auth_user_id')
await attempt('owner PATCH username staf', tokOwner, 'owner A', A.staff, { username: 'diretas' }, 'username')
await svc('PATCH', `staff?id=eq.${A.staff}`, { username: snapStaff.username })
{
  const res = await rest(tokOwner, 'PATCH', `rest/v1/staff?id=eq.${A.staff}`, { is_active: false }, { Prefer: 'return=representation' })
  const a = await staffRow(A.staff)
  rec('T9 kontrol positif', 'owner A', 'owner nonaktifkan staf tenantnya (harus boleh)', res.status, a.is_active === false, `is_active=${a.is_active}`)
  await svc('PATCH', `staff?id=eq.${A.staff}`, { is_active: true })
}

writeCsv('t1_t9_tenant_and_role.csv', rows)
