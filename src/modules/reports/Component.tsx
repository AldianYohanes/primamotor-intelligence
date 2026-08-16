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
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Laporan Tren Penjualan</h1>

      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="field-input w-full max-w-sm"
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
        <div className="h-80 card p-5">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
              <XAxis
                dataKey="periodLabel"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px -2px rgb(15 23 42 / 0.08)',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="totalKeluar"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Unit Terjual"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!isLoading && productId && trend.length === 0 && (
        <div className="card flex flex-col items-center gap-1.5 px-4 py-14 text-center text-slate-400">
          <p className="text-sm">Belum ada data transaksi keluar untuk produk ini.</p>
        </div>
      )}
    </div>
  )
}
