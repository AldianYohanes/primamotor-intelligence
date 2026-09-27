import useSWR from "swr";
import { fetchDashboardSummary } from "../services/dashboard-summary";
import { mapDashboardSummaryResponseToViewModel } from "../mappers/mappers";

export function useGetDashboardSummary(days: 7 | 30) {
  const { data, error, isLoading } = useSWR(
    ["/api/admin/pos/dashboard-summary", days],
    ([, d]) => fetchDashboardSummary({ days: d }),
    {
      revalidateOnFocus: false,
      // KPI "hari ini" perlu cukup segar tanpa staf harus refresh manual —
      // dashboard biasanya dibuka lalu ditinggal terbuka di layar kasir/admin.
      refreshInterval: 60_000,
    },
  );

  return {
    summary: data ? mapDashboardSummaryResponseToViewModel(data) : null,
    isLoading,
    error: error as Error | undefined,
  };
}
