// T4-T8 lewat server Next sungguhan (port 3100) + Supabase lokal.
// T4 replay, T5 konkurensi, T6 rollback, T7 pengusul, T8 cron.
// Prasyarat: server dev berjalan dengan env dari .env.test.local; seed_eval + fixture dimuat.
import { execSync } from 'node:child_process'
import { A, env, svc, writeCsv } from './_lib.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3100'
const PIN = env.EVAL_PIN
const DB = 'supabase_db_primamotor-intelligence'
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -d postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim()

const rows = []
const rec = (t, op, expected, actual, ok) => {
  rows.push({ test: t, operasi: op, diharapkan: expected, aktual: actual, verdict: ok ? 'LULUS' : 'GAGAL' })
  console.log(`${ok ? 'lulus' : 'GAGAL'}  ${t} ${op} | harap: ${expected} | aktual: ${actual}`)
}

async function loginCookie(username) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_slug: 'eval-prima-motor', username, pin: PIN }),
  })
  if (!r.ok) throw new Error(`login ${username} gagal: ${r.status} ${await r.text()}`)
  const cookies = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  if (!cookies) throw new Error('tidak ada cookie sesi')
  return cookies
}
const post = (path, cookie, body) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))

const stockOf = (loc) => sql(`select quantity||'/'||reserved_quantity from stock where product_id='${A.prod}' and location_id='${loc}'`)
const txnCount = (auditId) => Number(sql(`select count(*) from stock_transactions where agent_audit_log_id='${auditId}'`))
const auditStatus = (id) => sql(`select status from agent_audit_log where id='${id}'`)

const evaluator = await loginCookie('evaluator')
const owner = await loginCookie('owner')

// percakapan milik evaluator (pengusul)
const convId = 'e0000000-c0c0-0000-0000-0000000000a1'
await svc('POST', 'agent_conversations', { id: convId, business_id: A.biz, staff_id: A.staff }, { Prefer: 'resolution=ignore-duplicates' })

async function propose(dir, qty, loc = A.gudang) {
  const r = await post('/api/agent/tools/update-stock', evaluator, {
    business_id: A.biz, product_id: A.prod, location_id: loc, quantity: qty, direction: dir, conversation_id: convId, reasoning: 'tes integrasi',
  })
  if (r.status !== 200) throw new Error(`propose gagal ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.audit_log_id
}
const confirm = (cookie, auditId) =>
  post('/api/agent/tools/update-stock/confirm', cookie, { audit_log_id: auditId, staff_id: A.staff, business_slug: 'eval-prima-motor', username: 'evaluator', pin: PIN })

// ---- T4 replay
{
  const s0 = await stockOf(A.gudang)
  const id = await propose('masuk', 3)
  const r1 = await confirm(evaluator, id)
  const r2 = await confirm(evaluator, id)
  const s1 = await stockOf(A.gudang)
  const [q0] = s0.split('/'); const [q1] = s1.split('/')
  rec('T4', 'konfirmasi pertama lalu replay audit yang sama', '200 lalu 409; 1 transaksi; stok +3', `${r1.status} lalu ${r2.status}; txn=${txnCount(id)}; stok ${q0}->${q1}`,
    r1.status === 200 && r2.status === 409 && txnCount(id) === 1 && Number(q1) - Number(q0) === 3)
}

// ---- T5 konkurensi: 10 konfirmasi paralel
{
  const s0 = await stockOf(A.gudang)
  const id = await propose('masuk', 2)
  const res = await Promise.all(Array.from({ length: 10 }, () => confirm(evaluator, id)))
  const codes = res.map((r) => r.status)
  const ok = codes.filter((c) => c === 200).length
  const s1 = await stockOf(A.gudang)
  const [q0] = s0.split('/'); const [q1] = s1.split('/')
  rec('T5', '10 konfirmasi paralel atas satu audit', 'tepat 1x 200; 1 transaksi; stok +2', `200=${ok}, lainnya=${JSON.stringify(codes.filter((c) => c !== 200))}; txn=${txnCount(id)}; stok ${q0}->${q1}`,
    ok === 1 && txnCount(id) === 1 && Number(q1) - Number(q0) === 2)
}

// ---- T6 rollback
{
  // (a) stok kurang: usulan keluar melebihi stok ditolak, tanpa audit dan tanpa reservasi
  const s0 = await stockOf(A.gudang)
  const before = Number(sql(`select count(*) from agent_audit_log where business_id='${A.biz}'`))
  const r = await post('/api/agent/tools/update-stock', evaluator, { business_id: A.biz, product_id: A.prod, location_id: A.gudang, quantity: 100000, direction: 'keluar', conversation_id: convId, reasoning: 'tes' })
  const after = Number(sql(`select count(*) from agent_audit_log where business_id='${A.biz}'`))
  rec('T6a', 'usulan keluar melebihi stok', '422; tanpa audit baru; stok/reservasi sama', `${r.status}; audit ${before}->${after}; ${s0} -> ${await stockOf(A.gudang)}`,
    r.status === 422 && before === after && s0 === (await stockOf(A.gudang)))

  // (b) kegagalan disuntikkan saat pencatatan: audit failed, reservasi dilepas, stok tidak berubah
  const id = await propose('keluar', 1)
  const mid = await stockOf(A.gudang)
  sql(`create or replace function it_fail() returns trigger as $$ begin raise exception 'kegagalan disuntikkan'; end; $$ language plpgsql;
       create trigger it_fail_trg before insert on stock_transactions for each row when (new.agent_audit_log_id = '${id}') execute function it_fail();`)
  try {
    const c = await confirm(evaluator, id)
    const s1 = await stockOf(A.gudang)
    const [q0] = s0.split('/'); const [q1, r1] = s1.split('/')
    rec('T6b', 'kegagalan disuntikkan saat pencatatan (reservasi 1 sudah diambil)', 'audit failed; reservasi dilepas; stok & transaksi tidak berubah',
      `http=${c.status}; audit=${await auditStatus(id)}; sebelum-konfirmasi=${mid}; sesudah=${s1}; txn=${txnCount(id)}`,
      (await auditStatus(id)) === 'failed' && r1 === '0' && q1 === q0 && txnCount(id) === 0)
  } finally {
    sql('drop trigger if exists it_fail_trg on stock_transactions; drop function if exists it_fail();')
  }
}

// ---- T7 pengusul: owner (staf lain tenant yang sama) mengonfirmasi usulan evaluator
{
  const id = await propose('masuk', 1)
  const s0 = await stockOf(A.gudang)
  const r = await post('/api/agent/tools/update-stock/confirm', owner, { audit_log_id: id, staff_id: A.owner, business_slug: 'eval-prima-motor', username: 'owner', pin: PIN })
  rec('T7', 'owner mengonfirmasi usulan evaluator', '403; audit tetap pending; stok sama', `${r.status}; audit=${await auditStatus(id)}; stok ${s0}->${await stockOf(A.gudang)}`,
    r.status === 403 && (await auditStatus(id)) === 'pending' && s0 === (await stockOf(A.gudang)))
  sql(`update agent_audit_log set status='rejected' where id='${id}'`)
}

// ---- T8 cron
{
  const call = (h) => fetch(`${BASE}/api/cron/monitor`, { headers: h, redirect: 'manual' }).then((r) => r.status)
  // (a) seperti Vercel Cron: tanpa sesi login, hanya header Authorization
  const none = await call({})
  const good = await call({ Authorization: `Bearer ${env.CRON_SECRET}` })
  rec('T8a', 'cron tanpa sesi, tanpa secret', 'ditolak (bukan 200)', String(none), none !== 200)
  rec('T8a', 'cron tanpa sesi, secret BENAR (perilaku Vercel Cron)', '200', String(good), good === 200)
  // (b) dengan sesi login supaya pemeriksaan CRON_SECRET di route sendiri teruji
  const wrong = await call({ Cookie: evaluator, Authorization: 'Bearer salah' })
  const empty = await call({ Cookie: evaluator, Authorization: 'Bearer ' })
  const noauth = await call({ Cookie: evaluator })
  const goodS = await call({ Cookie: evaluator, Authorization: `Bearer ${env.CRON_SECRET}` })
  rec('T8b', 'route cron (dengan sesi): tanpa/salah/kosong secret', '401, 401, 401', `${noauth}, ${wrong}, ${empty}`, noauth === 401 && wrong === 401 && empty === 401)
  rec('T8b', 'route cron (dengan sesi): secret benar', '200', String(goodS), goodS === 200)
}

writeCsv('t4_t8_routes.csv', rows)
