// Pembantu bersama tes integrasi. Hanya untuk Supabase LOKAL; kunci dari .env.test.local.
import fs from 'node:fs'
import path from 'node:path'

export const env = Object.fromEntries(
  fs.readFileSync('.env.test.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1)]
  }),
)
export const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) throw new Error('Hanya untuk Supabase lokal')
export const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SVC = env.SUPABASE_SERVICE_ROLE_KEY
export const A = {
  biz: 'e0000000-0000-0000-0000-00000000e001',
  prod: 'e0000000-0d0c-0000-0000-000000000001',
  gudang: 'e0000000-0ca0-0000-0000-000000000002',
  toko: 'e0000000-0ca0-0000-0000-000000000001',
  staff: 'e0000000-5a1f-0000-0000-000000000001',
  owner: 'e0000000-5a1f-0000-0000-000000000002',
}
export const B = {
  biz: 'b0000000-0000-0000-0000-00000000b001',
  prod: 'b0000000-0d0c-0000-0000-000000000001',
  gudang: 'b0000000-0ca0-0000-0000-000000000001',
}

export async function rest(key, method, p, body, extra = {}) {
  const r = await fetch(`${URL_}/${p}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, json, headers: r.headers }
}
export const svc = (method, p, body, extra) => rest(SVC, method, `rest/v1/${p}`, body, extra)

export async function login(who) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `eval-prima-motor.${who}@staff.internal`, password: env.EVAL_PIN }),
  }).then((x) => x.json())
  if (!r.access_token) throw new Error(`Login ${who} gagal`)
  return r.access_token
}

export function writeCsv(name, rows) {
  const out = path.join('supabase', 'tests', 'integration', 'results')
  fs.mkdirSync(out, { recursive: true })
  const cols = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const f = path.join(out, name)
  fs.writeFileSync(f, [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'))
  console.log(`CSV: ${f}`)
}
