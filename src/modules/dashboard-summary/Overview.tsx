"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useGetDashboardOverview } from "./hooks/use-get-dashboard-overview";
import {
  formatMonthLabel,
  formatRupiah,
  formatRupiahShort,
} from "./utils/utils";

export function DashboardOverviewModule() {
  const { overview, isLoading, error, retry } = useGetDashboardOverview();

  if (error) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5" role="alert">
        <p className="text-sm text-red-500">
          Gagal memuat grafik bulanan, barang terlaris, dan stok menipis: {error.message}
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  const monthly = (overview?.monthly ?? []).map((m) => ({
    ...m,
    label: formatMonthLabel(m.month),
  }));
  const hasSales = monthly.some((m) => m.revenue > 0);
  const maxQty = Math.max(1, ...(overview?.top_products ?? []).map((p) => p.quantity));

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
          Penjualan per Bulan
        </h2>
        <p className="text-xs text-slate-500">
          Total nota POS yang selesai, 6 bulan terakhir (tidak termasuk nota batal).
        </p>

        {isLoading && <div className="mt-4 h-56 animate-pulse rounded-lg bg-slate-100" />}

        {!isLoading && !hasSales && (
          <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
            <p className="text-sm text-slate-600">Belum ada penjualan POS dalam 6 bulan terakhir.</p>
            <Link href="/pos" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Buka Kasir untuk mencatat penjualan
            </Link>
          </div>
        )}

        {!isLoading && hasSales && (
          <>
            <div
              className="mt-4 h-56"
              role="img"
              aria-label={`Grafik batang penjualan per bulan. ${monthly
                .map((m) => `${m.label}: ${formatRupiah(m.revenue)}`)
                .join("; ")}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatRupiahShort}
                  />
                  <Tooltip
                    cursor={{ fill: "#f1f5f9" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px -2px rgb(15 23 42 / 0.08)",
                      fontSize: 12,
                    }}
                    formatter={(value, _name, item) => [
                      `${formatRupiah(Number(value))} (${item.payload.transaction_count} nota)`,
                      "Penjualan",
                    ]}
                  />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Versi teks untuk pembaca layar; grafiknya sendiri tidak bisa dibaca. */}
            <table className="sr-only">
              <caption>Penjualan per bulan</caption>
              <thead>
                <tr>
                  <th>Bulan</th>
                  <th>Penjualan</th>
                  <th>Jumlah nota</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{m.label}</td>
                    <td>{formatRupiah(m.revenue)}</td>
                    <td>{m.transaction_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="top-products-title">
          <h2
            id="top-products-title"
            className="text-[13px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Barang Terlaris
          </h2>
          <p className="text-xs text-slate-500">
            Jumlah terjual {overview?.top_days ?? 30} hari terakhir.
          </p>
          {isLoading && <ListSkeleton />}
          {!isLoading && (overview?.top_products ?? []).length === 0 && (
            <p className="mt-4 text-sm text-slate-500">
              Belum ada barang terjual di rentang ini.
            </p>
          )}
          <ol className="mt-3 space-y-3">
            {(overview?.top_products ?? []).map((p, i) => (
              <li key={p.product_id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-slate-900">
                    <span className="mr-2 text-slate-500">{i + 1}.</span>
                    {p.name}
                  </p>
                  <p className="shrink-0 text-sm text-slate-700">{p.quantity} terjual</p>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden="true">
                  <div
                    className="h-1.5 rounded-full bg-brand-600"
                    style={{ width: `${Math.max(4, (p.quantity / maxQty) * 100)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{formatRupiah(p.revenue)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="card p-5" aria-labelledby="low-stock-title">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="low-stock-title"
              className="text-[13px] font-semibold uppercase tracking-wide text-slate-500"
            >
              Stok Menipis{overview ? ` (${overview.low_stock_total})` : ""}
            </h2>
            <Link
              href="/admin/stock"
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Lihat stok
              <ArrowRight size={12} />
            </Link>
          </div>
          <p className="text-xs text-slate-500">
            Stok tersedia (semua lokasi) sudah di batas minimum atau di bawahnya.
          </p>
          {isLoading && <ListSkeleton />}
          {!isLoading && (overview?.low_stock ?? []).length === 0 && (
            <p className="mt-4 text-sm text-slate-500">
              Semua barang masih di atas batas minimum.
            </p>
          )}
          <ul className="mt-3 divide-y divide-slate-100">
            {(overview?.low_stock ?? []).map((p) => (
              <li key={p.product_id}>
                <Link
                  href="/admin/stock"
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {p.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {p.part_number ? `${p.part_number} · ` : ""}minimum {p.min_threshold} {p.unit}
                    </span>
                  </span>
                  <span
                    className={`badge shrink-0 ${p.available_quantity <= 0 ? "badge-red" : "badge-amber"}`}
                  >
                    {p.available_quantity <= 0 && <AlertTriangle size={11} className="mr-1" aria-hidden="true" />}
                    {p.available_quantity <= 0 ? "Habis" : `Sisa ${p.available_quantity} ${p.unit}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {overview && overview.low_stock_total > overview.low_stock.length && (
            <p className="mt-2 text-xs text-slate-500">
              +{overview.low_stock_total - overview.low_stock.length} barang lain.{" "}
              <Link href="/admin/stock" className="font-medium text-brand-600 hover:text-brand-700">
                Lihat semua
              </Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-3 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
      ))}
    </div>
  );
}
