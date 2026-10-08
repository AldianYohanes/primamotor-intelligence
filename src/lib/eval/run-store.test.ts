import { describe, it, expect } from "vitest";
import {
  buildPlan,
  estimateRemainingMs,
  formatDuration,
  fromStoredRows,
  remainingPlan,
} from "@/src/lib/eval/run-store";
import type { Scenario } from "@/src/lib/eval/types";

describe("buildPlan / remainingPlan", () => {
  const plan = buildPlan(["Q-01", "Q-02"], ["multi_agent", "single_agent"]);

  it("menyelang-nyeling mode per skenario", () => {
    expect(plan.map((p) => `${p.scenarioId}:${p.mode}`)).toEqual([
      "Q-01:multi_agent",
      "Q-01:single_agent",
      "Q-02:multi_agent",
      "Q-02:single_agent",
    ]);
  });

  it("melanjutkan dari eksekusi yang belum punya hasil, urutan tetap", () => {
    const done = [
      { scenario: "Q-01", observation: { mode: "multi_agent" as const } },
      { scenario: "Q-01", observation: { mode: "single_agent" as const } },
    ];
    expect(remainingPlan(plan, done)).toEqual([
      { scenarioId: "Q-02", mode: "multi_agent" },
      { scenarioId: "Q-02", mode: "single_agent" },
    ]);
  });
});

describe("fromStoredRows", () => {
  it("memasang kembali objek skenario dan membuang id yang tidak dikenal", () => {
    const q1 = { id: "Q-01" } as Scenario;
    const rows = fromStoredRows(
      [
        { scenario: "Q-01", observation: { mode: "multi_agent" } },
        { scenario: "X-99", observation: { mode: "multi_agent" } },
      ] as never,
      [q1],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].scenario).toBe(q1);
  });
});

describe("estimateRemainingMs / formatDuration", () => {
  it("memakai median durasi eksekusi", () => {
    expect(estimateRemainingMs([100, 300, 200], 10)).toBe(2000);
    expect(estimateRemainingMs([], 10)).toBeNull();
  });

  it("memformat jam dan menit", () => {
    expect(formatDuration(95 * 60000)).toBe("1 j 35 mnt");
    expect(formatDuration(4 * 60000)).toBe("4 mnt");
  });
});
