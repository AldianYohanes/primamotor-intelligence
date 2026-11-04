import { describe, it, expect } from "vitest";
import { assessAnswerQuality } from "@/src/lib/eval/answer-quality";
import { hasRepetition, hasSelfTalk, isDegenerateAnswer } from "@/src/lib/agents/answer-quality";
import type { Observation, Scenario } from "@/src/lib/eval/types";

const row = (location_name: string, q: number) => ({ location_name, quantity: q, available_quantity: q });
const radiator = { product_id: "p1", name: "Radiator Volvo 240", stock_by_location: [row("Toko", 2), row("Gudang", 3)] };
const karburator = { product_id: "p2", name: "Karburator Volvo 240", stock_by_location: [row("Toko", 1), row("Gudang", 1)] };

const q01: Scenario = {
  id: "Q-01",
  message: "Radiator Volvo 240 ada stoknya?",
  expected_route: "query",
  variant: "langsung",
  expected_tools: ["getStock"],
  expected_entity: "EVAL-001",
  expect_pending: false,
  label_status: "reviewed",
};
const q02: Scenario = { ...q01, id: "Q-02", message: "Sisa filter oli mahle berapa di toko?" };

function obs(assistantText: string, rows: unknown[] = [radiator, karburator]): Observation {
  return {
    scenarioId: "x",
    mode: "multi_agent",
    predictedRoute: "query",
    assistantText,
    toolTrace: [{ name: "getStock", args: {}, result: { results: rows } }],
    pending: false,
    confirmOutcome: "none",
    stockBefore: {},
    stockAfter: {},
    latencyMs: 1000,
    promptTokens: null,
    completionTokens: null,
  };
}

describe("assessAnswerQuality", () => {
  it("jawaban rapi lolos", () => {
    expect(assessAnswerQuality(q01, obs("Stok Radiator Volvo 240: Toko 2, Gudang 3 (total 5)."))).toEqual({ ok: true, issues: [] });
  });

  it("menangkap pengulangan dan kepanjangan (Q-01 multi)", () => {
    const text = "Stok radiator Volvo 240 tersedia.\n" + "Toko: 2, Gudang: 3.\n".repeat(40);
    const r = assessAnswerQuality(q01, obs(text));
    expect(r?.ok).toBe(false);
    expect(r?.issues.join()).toContain("berulang");
    expect(r?.issues.join()).toContain("terlalu panjang");
  });

  it("menangkap barang di luar hasil alat (Q-01 single: bohlam sein)", () => {
    const r = assessAnswerQuality(q01, obs("Radiator Volvo 240 ada stoknya.\n\nToko: 2, Gudang: 3.\n\nSisa bohlam sein: 1."));
    expect(r?.issues.join()).toContain("bohlam sein");
  });

  it("nama barang lain yang ada di hasil alat tidak dianggap asing", () => {
    expect(assessAnswerQuality(q01, obs("Radiator Volvo 240: Toko 2, Gudang 3.\nKarburator Volvo 240: Toko 1, Gudang 1."))?.ok).toBe(true);
  });

  it("menangkap jawaban cadangan dan ngomong sendiri", () => {
    expect(assessAnswerQuality(q01, obs("Maaf, permintaan ini terlalu kompleks untuk saya proses sekarang."))?.ok).toBe(false);
    expect(assessAnswerQuality(q01, obs("Toko 2, Gudang 3. Tapi tunggu, saya cek lagi."))?.ok).toBe(false);
  });

  it("menangkap lokasi yang ditanya tapi tidak terjawab", () => {
    const filter = { product_id: "p6", name: "Filter Oli Mahle", stock_by_location: [row("Toko", 25), row("Gudang", 60)] };
    expect(assessAnswerQuality(q02, obs("Stok Filter Oli Mahle: Gudang 60.", [filter]))?.issues.join()).toContain("toko");
    expect(assessAnswerQuality(q02, obs("Stok Filter Oli Mahle: Gudang 60, Toko 25.", [filter]))?.ok).toBe(true);
  });

  it("menangkap jawaban stok tanpa angka dari hasil alat (Q-02 multi: 'saya akan mencoba lagi')", () => {
    const r = assessAnswerQuality(q01, obs("Saya mengerti, saya akan mencoba lagi dengan format yang benar:"));
    expect(r?.issues.join()).toContain("angka stok");
  });

  it("tidak dinilai bila run error atau jawaban kosong", () => {
    expect(assessAnswerQuality(q01, { ...obs("x"), runError: "boom" })).toBeNull();
    expect(assessAnswerQuality(q01, obs("  "))).toBeNull();
  });
});

describe("pemeriksa teks", () => {
  it("hasRepetition butuh tiga kali", () => {
    expect(hasRepetition("Toko: 2, Gudang: 3.\nToko: 2, Gudang: 3.")).toBe(false);
    expect(hasRepetition("Toko: 2, Gudang: 3.\nToko: 2, Gudang: 3.\nToko: 2, Gudang: 3.")).toBe(true);
  });
  it("hasSelfTalk dan isDegenerateAnswer", () => {
    expect(hasSelfTalk("Staf: \"ada?\"\nKamu:")).toBe(true);
    expect(hasSelfTalk("Stok Busi: Toko 4.")).toBe(false);
    expect(isDegenerateAnswer("a".repeat(700))).toBe(true);
  });
});
