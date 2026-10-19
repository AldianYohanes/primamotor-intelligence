import { describe, it, expect } from "vitest";
import {
  InferenceMeter,
  formatElapsed,
  formatSeconds,
  inferenceTotals,
  liveTokPerS,
  type InferenceSnapshot,
} from "@/src/lib/agents/inference-stats";

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("InferenceMeter", () => {
  it("mencatat waktu, token, dan kecepatan dari usage.extra WebLLM", () => {
    const clock = fakeClock();
    const updates: InferenceSnapshot[] = [];
    const meter = new InferenceMeter("Qwen2.5-3B-Instruct-q4f16_1-MLC", (s) => updates.push(s), clock.now);

    const router = meter.startCall("Router");
    clock.advance(1200);
    meter.finishCall(router, { prompt_tokens: 600, completion_tokens: 3 });

    const agent = meter.startCall("Agent");
    clock.advance(4000);
    meter.tick(agent);
    clock.advance(1000);
    meter.tick(agent);
    meter.finishCall(agent, {
      prompt_tokens: 2100,
      completion_tokens: 40,
      extra: { prefill_tokens_per_s: 520, decode_tokens_per_s: 9.5, time_to_first_token_s: 3.9 },
    });

    const snap = meter.snapshot();
    expect(snap.calls.map((c) => [c.label, c.status, c.durationMs])).toEqual([
      ["Router", "done", 1200],
      ["Agent", "done", 5000],
    ]);
    expect(snap.calls[1]).toMatchObject({ promptTokens: 2100, completionTokens: 40, decodeTokPerS: 9.5, timeToFirstTokenMs: 3900 });
    expect(updates.length).toBeGreaterThan(3);
  });

  it("waktu kata pertama diukur sendiri kalau WebLLM tidak mengirim extra", () => {
    const clock = fakeClock();
    const meter = new InferenceMeter("m", undefined, clock.now);
    const i = meter.startCall("Agent");
    clock.advance(2500);
    meter.tick(i);
    meter.finishCall(i, { prompt_tokens: 10, completion_tokens: 1 });
    expect(meter.snapshot().calls[0]!.timeToFirstTokenMs).toBe(2500);
  });

  it("panggilan yang sudah selesai tidak berubah oleh tick terlambat", () => {
    const clock = fakeClock();
    const meter = new InferenceMeter("m", undefined, clock.now);
    const i = meter.startCall("Agent");
    meter.finishCall(i, null);
    meter.tick(i);
    expect(meter.snapshot().calls[0]!.liveTokens).toBe(0);
  });
});

describe("inferenceTotals", () => {
  it("menjumlah token dan merata-rata kecepatan menulis menurut jumlah token", () => {
    const totals = inferenceTotals({
      modelId: "m",
      calls: [
        { label: "Router", status: "done", durationMs: 1000, liveTokens: 0, promptTokens: 500, completionTokens: 2 },
        { label: "Agent", status: "done", durationMs: 4000, liveTokens: 0, promptTokens: 2000, completionTokens: 20, decodeTokPerS: 10 },
        { label: "Agent", status: "done", durationMs: 3000, liveTokens: 0, promptTokens: 2100, completionTokens: 30, decodeTokPerS: 5 },
      ],
    });
    expect(totals).toMatchObject({ calls: 3, modelMs: 8000, promptTokens: 4600, completionTokens: 52 });
    // 50 token dalam 2 + 6 detik
    expect(totals.decodeTokPerS).toBeCloseTo(6.25);
  });
});

describe("liveTokPerS", () => {
  it("dihitung dari token sesudah kata pertama", () => {
    expect(
      liveTokPerS({ label: "Agent", status: "running", durationMs: 5000, liveTokens: 11, timeToFirstTokenMs: 3000 }),
    ).toBeCloseTo(5);
    expect(liveTokPerS({ label: "Agent", status: "running", durationMs: 3000, liveTokens: 1, timeToFirstTokenMs: 3000 })).toBeUndefined();
  });
});

describe("format", () => {
  it("menampilkan menit:detik dan detik berkoma", () => {
    expect(formatElapsed(42_000)).toBe("0:42");
    expect(formatElapsed(125_400)).toBe("2:05");
    expect(formatSeconds(38_400)).toBe("38,4 dtk");
  });
});
