import { describe, it, expect } from "vitest";
import {
  buildPlan,
  estimateRemainingMs,
  formatDuration,
  fromStoredRows,
  remainingPlan,
  runFromExport,
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

describe("buildPlan berulang", () => {
  it("mengulang seluruh daftar per ulangan dan ulangan 1 tanpa field repetition", () => {
    const plan = buildPlan(["Q-01"], ["multi_agent", "single_agent"], 2);
    expect(plan).toEqual([
      { scenarioId: "Q-01", mode: "multi_agent" },
      { scenarioId: "Q-01", mode: "single_agent" },
      { scenarioId: "Q-01", mode: "multi_agent", repetition: 2 },
      { scenarioId: "Q-01", mode: "single_agent", repetition: 2 },
    ]);
  });

  it("hasil ulangan 1 tidak menutup eksekusi ulangan 2", () => {
    const plan = buildPlan(["Q-01"], ["multi_agent"], 2);
    const done = [{ scenario: "Q-01", observation: { mode: "multi_agent" as const } }];
    expect(remainingPlan(plan, done)).toEqual([{ scenarioId: "Q-01", mode: "multi_agent", repetition: 2 }]);
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

describe("runFromExport", () => {
  const scenarios = [{ id: "Q-01" }, { id: "Q-02" }] as Scenario[];
  const row = (scenario: string, mode: string, repetition?: number) => ({ scenario, observation: { mode, ...(repetition ? { repetition } : {}) }, success: true });
  const file = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      startedAt: "2026-10-29T08:00:00.000Z",
      scenarioVersion: "v1",
      environment: { model: "Qwen3.5-0.8B-q4f16_1-MLC", promptPadding: false, codeGuardsOff: false },
      interruptions: [],
      resumed: [],
      rows: [row("Q-01", "multi_agent"), row("Q-01", "single_agent")],
      ...extra,
    });
  const opts = { scenarioVersion: "v1", scenarios, fallbackPlan: buildPlan(["Q-01", "Q-02"], ["multi_agent", "single_agent"]) };

  it("memulihkan run dan menyisakan eksekusi yang belum ada di rencana layar", () => {
    const res = runFromExport(file(), opts);
    if (!res.ok) throw new Error(res.error);
    expect(res.run.modelId).toBe("Qwen3.5-0.8B-q4f16_1-MLC");
    expect(res.run.promptPadding).toBe(false);
    expect(res.imported).toBe(2);
    expect(remainingPlan(res.run.plan, res.run.rows)).toEqual([
      { scenarioId: "Q-02", mode: "multi_agent" },
      { scenarioId: "Q-02", mode: "single_agent" },
    ]);
  });

  it("memakai plan dari berkas bila ada, dan stoppedReason masuk ke daftar gangguan", () => {
    const stop = { kind: "gpu", message: "device lost", during: "Q-02 multi_agent", at: "2026-10-29T09:00:00.000Z" };
    const res = runFromExport(file({ plan: [{ scenarioId: "Q-01", mode: "multi_agent" }, { scenarioId: "Q-01", mode: "single_agent" }], stoppedReason: stop }), opts);
    if (!res.ok) throw new Error(res.error);
    expect(res.run.plan).toHaveLength(2);
    expect(res.run.interruptions).toEqual([stop]);
  });

  it("baris dengan skenario tak dikenal dilewati, dan baris di luar rencana tetap dihitung", () => {
    const res = runFromExport(file({ rows: [row("Q-01", "multi_agent"), row("X-99", "multi_agent")] }), { ...opts, fallbackPlan: buildPlan(["Q-02"], ["multi_agent"]) });
    if (!res.ok) throw new Error(res.error);
    expect(res.skipped).toBe(1);
    expect(res.run.plan).toEqual([{ scenarioId: "Q-01", mode: "multi_agent" }, { scenarioId: "Q-02", mode: "multi_agent" }]);
  });

  it("menolak berkas rusak, bukan ekspor, atau beda versi skenario", () => {
    expect(runFromExport("{", opts)).toMatchObject({ ok: false });
    expect(runFromExport("[]", opts)).toMatchObject({ ok: false });
    expect(runFromExport(file({ scenarioVersion: "v0" }), opts)).toMatchObject({ ok: false, error: expect.stringContaining("v0") });
    expect(runFromExport(file({ rows: [] }), opts)).toMatchObject({ ok: false });
  });
});
