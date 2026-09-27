import type { DashboardSummaryResponse } from "../data/response";
import { formatDayLabel, formatRupiah } from "../utils/utils";

export interface DashboardTrendPointViewModel {
  dayLabel: string;
  revenue: number;
  transactionCount: number;
}

export interface DashboardSummaryViewModel {
  todayRevenue: number;
  todayRevenueFormatted: string;
  todayTransactionCount: number;
  activeShiftCount: number;
  trend: DashboardTrendPointViewModel[];
}

export function mapDashboardSummaryResponseToViewModel(
  res: DashboardSummaryResponse,
): DashboardSummaryViewModel {
  return {
    todayRevenue: res.today_revenue,
    todayRevenueFormatted: formatRupiah(res.today_revenue),
    todayTransactionCount: res.today_transaction_count,
    activeShiftCount: res.active_shift_count,
    trend: res.trend.map((point) => ({
      dayLabel: formatDayLabel(point.date),
      revenue: point.revenue,
      transactionCount: point.transaction_count,
    })),
  };
}
