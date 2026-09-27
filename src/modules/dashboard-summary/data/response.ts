export interface DashboardTrendPointResponse {
  date: string;
  revenue: number;
  transaction_count: number;
}

export interface DashboardSummaryResponse {
  today_revenue: number;
  today_transaction_count: number;
  active_shift_count: number;
  trend: DashboardTrendPointResponse[];
}
