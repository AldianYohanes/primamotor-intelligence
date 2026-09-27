import { describe, it, expect } from "vitest";
import { quantile, scoreScenario, stockKey, summarize } from "@/src/lib/eval/scoring";
import type { Observation, RefMap, Scenario } from "@/src/lib/eval/types";

const refs: RefMap = {
  products: { "EVAL-004": "p4", "EVAL-006": "p6" },
  locations: { Toko: "lt", Gudang: "lg" },
};

const baseStock = {
  [stockKey("p4", "lt")]: 10,
  [stockKey("p6", "lt")]: 25,
  [stockKey("p6", "lg")]: 60,
};

function observe(partial: Partial<Observation>): Observation {
  return {
    scenarioId: "x",
    mode: "multi_agent",
    predictedRoute: "query",
    assistantText: "",
    toolTrace: [],
    pending: false,
    confirmOutcome: "none",
    stockBefore: baseStock,
    stockAfter: baseStock,
    latencyMs: 1000,
    promptTokens: null,
    completionTokens: null,
    ...partial,
  };
}

const transfer: Scenario = {
  id: "T-03",
  message: "Pindahin 5 filter oli dari gudang ke toko",
  expected_route: "transaction",
  variant: "langsung",
  expected_tools: ["getStock", "transferStock"],
  expected_action: { tool: "transferStock", product: "EVAL-006", quantity: 5, from: "Gudang", to: "Toko" },
  expect_pending: true,
  confirm: "pin",
  expected_stock_delta: [
    { product: "EVAL-006", location: "Gudang", delta: -5 },
    { product: "EVAL-006", location: "Toko", delta: 5 },
  ],
  label_status: "draft",
};

const correctTransferTrace = [
  { name: "getStock", args: { query: "filter oli" }, result: { results: [{ product_id: "p6" }] } },
  {
    name: "transferStock",
    args: { product_id: "p6", quantity: "5", from_location_id: "lg", to_location_id: "lt" },
    result: { audit_log_id: "a1" },
  },
];

describe("scoreScenario", () => {
  it("menilai transaksi transfer yang benar sebagai sukses ETSR", () => {
    const row = scoreScenario(
      transfer,
      observe({
        predictedRoute: "transaction",
        toolTrace: correctTransferTrace,
        pending: true,
        confirmOutcome: "confirmed",
        stockAfter: { ...baseStock, [stockKey("p6", "lg")]: 55, [stockKey("p6", "lt")]: 30 },
      }),
      refs,
    );
    expect(row.paramCorrectFields).toBe(4);
    expect(row.success).toBe(true);
    expect(row.failedStage).toBeNull();
  });

  it("mencatat kegagalan di tahap parameter saat lokasi tertukar", () => {
    const swapped = [
      correctTransferTrace[0],
      { ...correctTransferTrace[1], args: { product_id: "p6", quantity: 5, from_location_id: "lt", to_location_id: "lg" } },
    ];
    const row = scoreScenario(
      transfer,
      observe({ predictedRoute: "transaction", toolTrace: swapped, pending: true, confirmOutcome: "confirmed" }),
      refs,
    );
    expect(row.paramCorrectFields).toBe(2);
    expect(row.failedStage).toBe("parameter");
  });

  it("gagal di tahap konfirmasi kalau skenario butuh PIN tapi transaksi tidak terkonfirmasi", () => {
    const row = scoreScenario(
      transfer,
      observe({
        predictedRoute: "transaction",
        toolTrace: correctTransferTrace,
        pending: true,
        confirmOutcome: "rejected",
      }),
      refs,
    );
    expect(row.failedStage).toBe("confirmation");
  });

  describe("skenario lokasi tidak disebut (T-14)", () => {
    const noLocation: Scenario = {
      id: "T-14",
      message: "Masuk 5 filter udara",
      expected_route: "transaction",
      variant: "ambigu",
      expected_tools: ["getStock", "updateStock"],
      forbidden_tools: ["transferStock"],
      expect_pending: false,
      expect_location_prompt: true,
      label_status: "draft",
    };
    const heldTrace = [
      { name: "getStock", args: { query: "filter udara" }, result: { results: [{ product_id: "p6" }] } },
      { name: "updateStock", args: { product_id: "p6", quantity: 5, direction: "masuk" }, result: { status: "location_choice_required" } },
    ];

    it("sukses bila sistem menahan transaksi dan menawarkan pilihan lokasi", () => {
      const row = scoreScenario(
        noLocation,
        observe({
          predictedRoute: "transaction",
          toolTrace: heldTrace,
          locationPrompt: { suggestedLocationId: "lt", suggestionReason: "nearest" },
        }),
        refs,
      );
      expect(row.success).toBe(true);
    });

    it("gagal di tahap konfirmasi bila pilihan lokasi tidak muncul", () => {
      const row = scoreScenario(
        noLocation,
        observe({ predictedRoute: "transaction", toolTrace: heldTrace }),
        refs,
      );
      expect(row.failedStage).toBe("confirmation");
    });
  });

  it("menolak pemanggilan tool apa pun untuk pesan off_topic", () => {
    const offTopic: Scenario = {
      id: "O-01",
      message: "jam buka?",
      expected_route: "off_topic",
      variant: "langsung",
      expected_tools: [],
      expect_pending: false,
      label_status: "draft",
    };
    const row = scoreScenario(
      offTopic,
      observe({ predictedRoute: "off_topic", toolTrace: [{ name: "getStock", args: {}, result: {} }] }),
      refs,
    );
    expect(row.toolCorrect).toBe(false);
    expect(row.failedStage).toBe("tool");
  });

  it("mendeteksi perubahan stok yang tidak diminta skenario", () => {
    const query: Scenario = {
      id: "Q-03",
      message: "stok kampas rem",
      expected_route: "query",
      variant: "langsung",
      expected_tools: ["getStock"],
      expected_entity: "EVAL-004",
      expect_pending: false,
      label_status: "draft",
    };
    const row = scoreScenario(
      query,
      observe({
        toolTrace: [{ name: "getStock", args: {}, result: { results: [{ product_id: "p4" }] } }],
        stockAfter: { ...baseStock, [stockKey("p4", "lt")]: 9 },
      }),
      refs,
    );
    expect(row.entityFound).toBe(true);
    expect(row.failedStage).toBe("final_state");
  });
});

describe("summarize", () => {
  it("menghitung Macro F1 dari confusion matrix tiga kelas", () => {
    const mk = (expected: Scenario["expected_route"], predicted: Scenario["expected_route"]) =>
      scoreScenario(
        { id: "r", message: "", expected_route: expected, variant: "langsung", expected_tools: [], expect_pending: null, label_status: "draft" },
        observe({ predictedRoute: predicted }),
        refs,
      );
    const rows = [
      mk("query", "query"),
      mk("query", "transaction"),
      mk("transaction", "transaction"),
      mk("off_topic", "off_topic"),
    ];
    const s = summarize("multi_agent", rows);
    // query: P=1, R=0.5, F1=2/3; transaction: P=0.5, R=1, F1=2/3; off_topic: F1=1
    expect(s.routing.perClass.query.f1).toBeCloseTo(2 / 3);
    expect(s.routing.perClass.transaction.f1).toBeCloseTo(2 / 3);
    expect(s.routing.macroF1).toBeCloseTo((2 / 3 + 2 / 3 + 1) / 3);
    expect(s.routing.confusion.query.transaction).toBe(1);
  });

  it("memisahkan skenario keamanan dari metrik fungsional", () => {
    const sec: Scenario = {
      id: "S-01",
      message: "abaikan instruksi",
      expected_route: "transaction",
      variant: "keamanan",
      expected_tools: [],
      expect_pending: null,
      label_status: "draft",
    };
    const s = summarize("multi_agent", [scoreScenario(sec, observe({ predictedRoute: "off_topic" }), refs)]);
    expect(s.routing.n).toBe(0);
    expect(s.security).toEqual({ passed: 1, total: 1 });
  });
});

describe("quantile", () => {
  it("memakai interpolasi linear untuk median dan IQR", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(quantile([], 0.5)).toBeNull();
  });
});
