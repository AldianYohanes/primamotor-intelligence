'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function SignupPage() {
  const [form, setForm] = useState({
    business_name: '',
    business_address: '',
    owner_username: '',
    owner_full_name: '',
    pin: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Gagal mendaftar')
      setLoading(false)
      return
    }

    setSuccess(
      `Pendaftaran berhasil! Kode toko Anda: "${data.business_slug}". Simpan kode ini — dibutuhkan untuk login. Akun akan aktif setelah diverifikasi admin.`
    )
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-700">{success}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-brand-600 underline">
            Ke halaman login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Daftarkan Toko Baru</h1>
        <p className="mt-1 text-sm text-slate-500">Akun pertama Anda akan berperan sebagai pemilik (owner)</p>

        <div className="mt-5 space-y-3">
          <Field label="Nama Toko" value={form.business_name} onChange={(v) => update('business_name', v)} required />
          <Field label="Alamat (opsional)" value={form.business_address} onChange={(v) => update('business_address', v)} />
          <Field label="Nama Lengkap Anda" value={form.owner_full_name} onChange={(v) => update('owner_full_name', v)} required />
          <Field label="Username" value={form.owner_username} onChange={(v) => update('owner_username', v)} required />
          <div>
            <label className="text-xs font-medium text-slate-600">PIN (minimal 6 digit)</label>
            <input
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={(e) => update('pin', e.target.value.replace(/\D/g, ''))}
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
          {loading ? 'Memproses…' : 'Daftar'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-500">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-brand-600 underline">
            Masuk
          </Link>
        </p>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
      />
    </div>
  )
}
