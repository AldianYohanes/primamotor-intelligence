import { describe, it, expect } from "vitest";
import { computeShiftReportTotals } from "@/src/lib/pos/shift-report";

function fakeClient(sales: object[], payments: object[]) {
  const chain = (data: object[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "in"]) q[m] = () => q;
    q.then = (resolve: (v: { data: object[] }) => void) => resolve({ data });
    return q;
  };
  return { from: (t: string) => chain(t === "sales" ? sales : payments) } as never;
}

const params = { businessId: "b", staffId: "s", locationId: "l", openingCash: 500000, fromISO: "", toISO: "" };

describe("computeShiftReportTotals", () => {
  it("kembalian tidak masuk kas harapan: bayar 100.000 untuk nota 95.000", async () => {
    const client = fakeClient(
      [{ id: "1", total_amount: 95000, status: "completed", payment_method: "cash", change_amount: 5000 }],
      [{ sale_id: "1", payment_method: "cash", amount: 100000 }],
    );
    const t = await computeShiftReportTotals(client, params);
    expect(t.cashTotal).toBe(95000);
    expect(t.expectedCash).toBe(595000);
  });

  it("nota non-tunai, split, piutang, dan void tidak mengubah hitungan tunai", async () => {
    const client = fakeClient(
      [
        { id: "1", total_amount: 100000, status: "completed", payment_method: "qris", change_amount: 0 },
        { id: "2", total_amount: 80000, status: "completed", payment_method: "split", change_amount: 0 },
        { id: "3", total_amount: 50000, status: "completed", payment_method: "piutang", change_amount: 0 },
        { id: "4", total_amount: 70000, status: "voided", payment_method: "cash", change_amount: 5000 },
      ],
      [
        { sale_id: "1", payment_method: "qris", amount: 100000 },
        { sale_id: "2", payment_method: "cash", amount: 30000 },
        { sale_id: "2", payment_method: "transfer", amount: 50000 },
      ],
    );
    const t = await computeShiftReportTotals(client, params);
    expect(t.cashTotal).toBe(30000);
    expect(t.expectedCash).toBe(530000);
    expect(t.voidCount).toBe(1);
    expect(t.piutangTotal).toBe(50000);
  });
});
