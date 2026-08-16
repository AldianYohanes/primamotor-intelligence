'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

// useSearchParams() mewajibkan Suspense boundary di sekitarnya saat prerender
// (Next.js App Router) — kalau tidak, `next build` gagal dengan error
// "should be wrapped in a suspense boundary". LoginForm dipisah dari default
// export supaya boundary-nya jelas di satu titik.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-[#f7f8fa]" />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [businessSlug, setBusinessSlug] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_slug: businessSlug, username, pin }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Gagal masuk')
      setLoading(false)
      return
    }

    router.push(searchParams.get('redirect') ?? '/chat')
    router.refresh()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f8fa] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            PV
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Prima Motor Volvo</h1>
            <p className="mt-0.5 text-sm text-slate-500">Masuk dengan akun toko Anda</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          <div className="space-y-3.5">
            <div>
              <label className="field-label">Kode Toko</label>
              <input
                value={businessSlug}
                onChange={(e) => setBusinessSlug(e.target.value)}
                placeholder="prima-motor-volvo"
                className="field-input mt-1"
                required
              />
            </div>
            <div>
              <label className="field-label">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="field-input mt-1"
                required
              />
            </div>
            <div>
              <label className="field-label">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                maxLength={12}
                className="field-input mt-1 text-center text-lg tracking-widest"
                required
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary mt-5 w-full py-2.5">
            {loading ? 'Memproses…' : 'Masuk'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Toko baru?{' '}
          <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
            Daftar di sini
          </Link>
        </p>
      </div>
    </div>
  )
}
