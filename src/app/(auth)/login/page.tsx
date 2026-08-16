'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

// useSearchParams() mewajibkan Suspense boundary di sekitarnya saat prerender
// (Next.js App Router) — kalau tidak, `next build` gagal dengan error
// "should be wrapped in a suspense boundary". LoginForm dipisah dari default
// export supaya boundary-nya jelas di satu titik.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-slate-50" />}>
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
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Prima Motor Volvo</h1>
        <p className="mt-1 text-sm text-slate-500">Masuk dengan akun toko Anda</p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Kode Toko</label>
            <input
              value={businessSlug}
              onChange={(e) => setBusinessSlug(e.target.value)}
              placeholder="prima-motor-volvo"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              maxLength={12}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-widest focus:border-brand-600 focus:outline-none"
              required
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Memproses…' : 'Masuk'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-500">
          Toko baru?{' '}
          <Link href="/signup" className="text-brand-600 underline">
            Daftar di sini
          </Link>
        </p>
      </form>
    </div>
  )
}
