'use client'

import { useEffect, useState } from 'react'

interface Business {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
}

export function TenantApprovalList() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/tenants')
    const data = await res.json()
    setBusinesses((data.businesses ?? []).filter((b: Business) => b.status === 'pending_verification'))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function act(id: string, action: 'approve' | 'reject') {
    await fetch(`/api/admin/tenants/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    load()
  }

  if (loading) return null
  if (businesses.length === 0) return null

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700">Toko Menunggu Verifikasi ({businesses.length})</h2>
      <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-amber-200 bg-amber-50">
        {businesses.map((b) => (
          <div key={b.id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-slate-900">{b.name}</p>
              <p className="text-xs text-slate-500">Kode: {b.slug}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => act(b.id, 'reject')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600">
                Tolak
              </button>
              <button onClick={() => act(b.id, 'approve')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white">
                Setujui
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
