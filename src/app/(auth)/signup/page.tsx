'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

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
      <div className="flex min-h-dvh items-center justify-center bg-[#f7f8fa] p-4">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={22} />
          </div>
          <p className="text-sm text-slate-700">{success}</p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Ke halaman login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f8fa] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            PV
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Daftarkan Toko Baru</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Akun pertama Anda akan berperan sebagai pemilik (owner)
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          <div className="space-y-3.5">
            <Field label="Nama Toko" value={form.business_name} onChange={(v) => update('business_name', v)} required />
            <Field label="Alamat (opsional)" value={form.business_address} onChange={(v) => update('business_address', v)} />
            <Field label="Nama Lengkap Anda" value={form.owner_full_name} onChange={(v) => update('owner_full_name', v)} required />
            <Field label="Username" value={form.owner_username} onChange={(v) => update('owner_username', v)} required />
            <div>
              <label className="field-label">PIN (minimal 6 digit)</label>
              <input
                type="password"
                inputMode="numeric"
                value={form.pin}
                onChange={(e) => update('pin', e.target.value.replace(/\D/g, ''))}
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
            {loading ? 'Memproses…' : 'Daftar'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Sudah punya akun?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
            Masuk
          </Link>
        </p>
      </div>
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
      <label className="field-label">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="field-input mt-1"
      />
    </div>
  )
}
