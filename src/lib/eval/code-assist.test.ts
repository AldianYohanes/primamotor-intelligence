import { describe, it, expect } from "vitest";
import { codeAssistLabels, codeAssistOf } from "@/src/lib/eval/code-assist";
import type { Observation } from "@/src/lib/eval/types";

function obs(partial: Partial<Observation>): Observation {
  return {
    scenarioId: "x",
    mode: "multi_agent",
    predictedRoute: "query",
    assistantText: "ok",
    toolTrace: [],
    pending: false,
    confirmOutcome: "none",
    stockBefore: {},
    stockAfter: {},
    latencyMs: 1,
    promptTokens: null,
    completionTokens: null,
    ...partial,
  };
}

describe("codeAssistOf", () => {
  it("tanpa bantuan: semua false", () => {
    expect(codeAssistOf(obs({})).any).toBe(false);
  });

  it("rute dikoreksi kode atau diputuskan kode", () => {
    expect(codeAssistOf(obs({ routerPredictedRoute: "transaction" })).route).toBe(true);
    expect(codeAssistOf(obs({ routedByCode: true })).route).toBe(true);
    expect(codeAssistOf(obs({ routerPredictedRoute: "query" })).route).toBe(false);
  });

  it("membaca penanda assist di langkah proses", () => {
    const a = codeAssistOf(
      obs({
        processSteps: [
          { kind: "retry", label: "x", status: "done", assist: "retry" },
          { kind: "action", label: "y", status: "done", assist: "tool" },
          { kind: "answer", label: "z", status: "done", assist: "answer" },
          { kind: "action", label: "validasi bawaan", status: "done" },
        ],
      }),
    );
    expect(codeAssistLabels(a)).toEqual(["alat", "ulang", "jawaban"]);
    expect(a.any).toBe(true);
  });
});
