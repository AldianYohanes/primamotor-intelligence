import useSWR from "swr";
import { fetchDashboardOverview } from "../services/dashboard-overview";

export function useGetDashboardOverview() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/admin/dashboard/overview",
    fetchDashboardOverview,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );

  return {
    overview: data ?? null,
    isLoading,
    error: error as Error | undefined,
    retry: () => void mutate(),
  };
}
