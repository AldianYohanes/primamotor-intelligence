import type { DashboardOverviewResponse } from "../data/overview";

export async function fetchDashboardOverview(): Promise<DashboardOverviewResponse> {
  const res = await fetch("/api/admin/dashboard/overview");
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String(body.error)
        : null) ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as DashboardOverviewResponse;
}
