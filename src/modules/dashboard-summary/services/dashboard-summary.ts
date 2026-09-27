import type { DashboardSummaryParams } from "../data/params";
import type { DashboardSummaryResponse } from "../data/response";

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String(body.error)
        : null) ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchDashboardSummary(
  params: DashboardSummaryParams,
): Promise<DashboardSummaryResponse> {
  const sp = new URLSearchParams({ days: String(params.days) });
  const res = await fetch(`/api/admin/pos/dashboard-summary?${sp}`);
  return parseJsonOrThrow<DashboardSummaryResponse>(res);
}
