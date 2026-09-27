"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Wallet, Receipt, Clock } from "lucide-react";
import { useGetDashboardSummary } from "./hooks/use-get-dashboard-summary";
import { formatRupiah } from "./utils/utils";

export function DashboardSummaryModule() {
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const { summary, isLoading, error } = useGetDashboardSummary(rangeDays);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          icon={Wallet}
          label="Pendapatan Hari Ini"
          value={summary ? summary.todayRevenueFormatted : null}
          isLoading={isLoading}
          tone="emerald"
        />
        <KpiCard
          icon={Receipt}
          label="Transaksi Hari Ini"
          value={summary ? String(summary.todayTransactionCount) : null}
          isLoading={isLoading}
          tone="blue"
        />
        <KpiCard
          icon={Clock}
          label="Shift Aktif Sekarang"
          value={summary ? String(summary.activeShiftCount) : null}
          isLoading={isLoading}
          tone={summary && summary.activeShiftCount > 0 ? "emerald" : "amber"}
        />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            Tren Pendapatan
          </h2>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            <RangeButton active={rangeDays === 7} onClick={() => setRangeDays(7)}>
              7 Hari
            </RangeButton>
            <RangeButton active={rangeDays === 30} onClick={() => setRangeDays(30)}>
              30 Hari
            </RangeButton>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-500">
            Gagal memuat data tren: {error.message}
          </p>
        )}

        {!error && isLoading && (
          <div className="mt-4 h-64 animate-pulse rounded-lg bg-slate-100" />
        )}

        {!error && !isLoading && summary && summary.trend.every((p) => p.revenue === 0) && (
          <div className="mt-4 flex h-64 flex-col items-center justify-center gap-1 text-center text-slate-400">
            <p className="text-sm">Belum ada penjualan POS di rentang ini.</p>
          </div>
        )}

        {!error && !isLoading && summary && summary.trend.some((p) => p.revenue > 0) && (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.trend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                <XAxis
                  dataKey="dayLabel"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  interval={rangeDays === 30 ? 3 : 0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px -2px rgb(15 23 42 / 0.08)",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [formatRupiah(value), "Pendapatan"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#revenueFill)"
                  name="Pendapatan"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function RangeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  isLoading,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string | null;
  isLoading: boolean;
  tone: "amber" | "blue" | "emerald";
}) {
  const iconTone =
    tone === "amber"
      ? "bg-amber-50 text-amber-600"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-600"
        : "bg-brand-50 text-brand-600";

  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
        <Icon size={19} strokeWidth={2} />
      </div>
      <div>
        {isLoading || value === null ? (
          <div className="h-7 w-20 animate-pulse rounded bg-slate-100" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        )}
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
