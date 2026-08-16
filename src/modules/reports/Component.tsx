'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useGetReportProductOptions } from './hooks/use-get-report-options'
import { useGetSalesTrend } from './hooks/use-get-sales-trend'

export function ReportsModule() {
  const [productId, setProductId] = useState('')
  const { products } = useGetReportProductOptions()
  const { trend, isLoading } = useGetSalesTrend(productId)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Laporan Tren Penjualan</h1>

      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Pilih produk untuk lihat tren…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {isLoading && <p className="text-sm text-slate-400">Memuat data…</p>}

      {!isLoading && productId && trend.length > 0 && (
        <div className="h-80 rounded-xl border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="periodLabel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="totalKeluar" stroke="#2563eb" strokeWidth={2} name="Unit Terjual" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!isLoading && productId && trend.length === 0 && (
        <p className="text-sm text-slate-400">Belum ada data transaksi keluar untuk produk ini.</p>
      )}
    </div>
  )
}
