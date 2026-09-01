"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useGetShifts } from "./hooks/use-get-shifts";
import { useGetShiftReport } from "./hooks/use-get-shift-report";
import type { ShiftStatusFilter } from "./data/params";
import { formatRupiah } from "./utils/utils";

/**
 * modules/pos-shifts/Component.tsx — riwayat shift SEMUA kasir, untuk
 * admin/owner memantau rekonsiliasi kas lintas staf. Beda dari panel shift
 * di pos-terminal (yang cuma tunjukkan shift milik staf yang sedang login).
 * Backend (`GET /api/admin/pos/shifts`) otomatis kembalikan semua shift
 * tenant kalau pemanggilnya role admin/owner (lihat requireStaff di route).
 */
export function PosShiftsModule() {
  const [statusFilter, setStatusFilter] = useState<ShiftStatusFilter>("all");
  const { shifts, isLoading, error } = useGetShifts({ status: statusFilter });
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Riwayat Shift Kasir</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ShiftStatusFilter)}
          className="field-input w-auto"
        >
          <option value="all">Semua Status</option>
          <option value="open">Terbuka</option>
          <option value="closed">Tertutup</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">Gagal memuat shift: {error.message}</p>}
      {isLoading && <p className="text-sm text-slate-400">Memuat…</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Kasir</th>
              <th className="px-4 py-2.5">Lokasi</th>
              <th className="px-4 py-2.5">Dibuka</th>
              <th className="px-4 py-2.5">Ditutup</th>
              <th className="px-4 py-2.5">Selisih Kas</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoading && shifts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Belum ada shift.
                </td>
              </tr>
            )}
            {shifts.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-medium text-slate-900">{s.staffName}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.locationName}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.openedAtFormatted}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.closedAtFormatted ?? "-"}</td>
                <td className={s.hasVarianceIssue ? "px-4 py-2.5 font-medium text-red-600" : "px-4 py-2.5 text-slate-600"}>
                  {s.cashVarianceFormatted ?? "-"}
                </td>
                <td className="px-4 py-2.5">
                  <span className={s.isOpen ? "badge badge-emerald" : "badge badge-slate"}>{s.statusLabel}</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setSelectedShiftId(s.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedShiftId && <ShiftReportDialog shiftId={selectedShiftId} onClose={() => setSelectedShiftId(null)} />}
    </div>
  );
}

function ShiftReportDialog({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const { report, isLoading, error } = useGetShiftReport(shiftId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-popover">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Laporan Shift</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {isLoading && <p className="py-6 text-center text-sm text-slate-400">Memuat…</p>}
        {error && <p className="text-sm text-red-600">Gagal memuat: {error.message}</p>}

        {report && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-1.5 text-slate-600">
              <span>Kasir</span>
              <span className="text-right text-slate-900">{report.shift.staff?.full_name ?? "-"}</span>
              <span>Lokasi</span>
              <span className="text-right text-slate-900">{report.shift.locations?.name ?? "-"}</span>
              <span>Kas Awal</span>
              <span className="text-right text-slate-900">{formatRupiah(report.shift.opening_cash)}</span>
            </div>

            <div className="space-y-1 rounded-md bg-slate-50 p-3">
              <Row label="Jumlah Nota" value={String(report.totals.salesCount)} />
              <Row label="Total Penjualan" value={formatRupiah(report.totals.grossRevenue)} bold />
              <Row label="— Tunai" value={formatRupiah(report.totals.cashTotal)} />
              <Row label="— Transfer" value={formatRupiah(report.totals.transferTotal)} />
              <Row label="— QRIS" value={formatRupiah(report.totals.qrisTotal)} />
              <Row label="— Kartu" value={formatRupiah(report.totals.cardTotal)} />
              <Row label="— Piutang" value={formatRupiah(report.totals.piutangTotal)} />
              {report.totals.voidCount > 0 && (
                <Row label="Nota Dibatalkan" value={`${report.totals.voidCount} (${formatRupiah(report.totals.voidTotalAmount)})`} />
              )}
            </div>

            {report.shift.status === "closed" ? (
              <div className="space-y-1 rounded-md border border-slate-200 p-3">
                <Row label="Kas Diharapkan" value={formatRupiah(report.totals.expectedCash)} />
                <Row label="Kas Fisik Dihitung" value={formatRupiah(report.shift.closing_cash ?? 0)} />
                <Row label="Selisih" value={formatRupiah(report.shift.cash_variance ?? 0)} bold />
              </div>
            ) : (
              <p className="text-xs text-slate-400">Shift masih terbuka — angka di atas adalah snapshot (X report), belum final.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={bold ? "flex justify-between font-semibold text-slate-900" : "flex justify-between text-slate-600"}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
