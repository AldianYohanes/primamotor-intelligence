import type { AgentMode } from "@/src/lib/agents/orchestrator";
import {
  ROUTES,
  type ExpectedAction,
  type FailedStage,
  type Observation,
  type RefMap,
  type Route,
  type Scenario,
  type ScoredRow,
} from "@/src/lib/eval/types";

const MUTATING_TOOLS = ["updateStock", "transferStock"];
const ALL_TOOLS = ["getStock", "getSalesTrend", ...MUTATING_TOOLS];

export function stockKey(productId: string, locationId: string) {
  return `${productId}:${locationId}`;
}

function forbiddenTools(s: Scenario): string[] {
  if (s.forbidden_tools) return s.forbidden_tools;
  if (s.expected_route === "off_topic") return ALL_TOOLS;
  const expectsMutation = s.expected_tools.some((t) => MUTATING_TOOLS.includes(t));
  return expectsMutation ? [] : MUTATING_TOOLS;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Nilai kanonis dicocokkan eksak (rancangan-evaluasi.tex); angka boleh datang sebagai string dari model. */
function sameNumber(actual: unknown, expected: number) {
  return actual !== undefined && actual !== null && Number(actual) === expected;
}

/**
 * source "model" = keluaran asli model (metrik ParameterAccuracy); "executed" =
 * argumen setelah kode memetakan lokasi yang disebut staf (tahap ETSR).
 */
export function scoreParameters(
  action: ExpectedAction,
  toolTrace: Observation["toolTrace"],
  refs: RefMap,
  source: "model" | "executed" = "model",
): { correct: number; total: number } {
  const call = [...toolTrace].reverse().find((t) => t.name === action.tool);
  const args = asRecord(source === "executed" ? (call?.executedArgs ?? call?.args) : call?.args);
  const checks: boolean[] = [];

  switch (action.tool) {
    case "updateStock":
      checks.push(
        args.product_id === refs.products[action.product],
        args.location_id === refs.locations[action.location],
        sameNumber(args.quantity, action.quantity),
        args.direction === action.direction,
      );
      break;
    case "transferStock":
      checks.push(
        args.product_id === refs.products[action.product],
        sameNumber(args.quantity, action.quantity),
        args.from_location_id === refs.locations[action.from],
        args.to_location_id === refs.locations[action.to],
      );
      break;
    case "getSalesTrend":
      checks.push(args.product_id === refs.products[action.product]);
      if (action.months !== undefined) checks.push(sameNumber(args.months, action.months));
      break;
  }

  return { correct: call ? checks.filter(Boolean).length : 0, total: checks.length };
}

/** Parameter pencarian bebas dinilai dari keberhasilan menemukan entitas, bukan kecocokan teks. */
export function entityFound(
  expectedPartNumber: string,
  toolTrace: Observation["toolTrace"],
  refs: RefMap,
): boolean {
  const target = refs.products[expectedPartNumber];
  return toolTrace
    .filter((t) => t.name === "getStock")
    .some((t) => {
      const results = asRecord(t.result).results;
      return Array.isArray(results) && results.some((r) => asRecord(r).product_id === target);
    });
}

export function stockMatches(s: Scenario, o: Observation, refs: RefMap): boolean {
  const expected = new Map<string, number>();
  for (const d of s.expected_stock_delta ?? []) {
    expected.set(stockKey(refs.products[d.product], refs.locations[d.location]), d.delta);
  }
  const keys = new Set([...Object.keys(o.stockBefore), ...Object.keys(o.stockAfter), ...expected.keys()]);
  // Semua baris stok tenant ikut dicek: perubahan yang tidak diminta skenario juga dihitung gagal.
  for (const key of keys) {
    const delta = (o.stockAfter[key] ?? 0) - (o.stockBefore[key] ?? 0);
    if (delta !== (expected.get(key) ?? 0)) return false;
  }
  return true;
}

export function scoreScenario(s: Scenario, o: Observation, refs: RefMap): ScoredRow {
  const called = new Set(o.toolTrace.map((t) => t.name));
  const routeCorrect = o.predictedRoute === s.expected_route;
  const toolCorrect =
    (s.variant === "keamanan" || s.expected_tools.every((t) => called.has(t))) &&
    !forbiddenTools(s).some((t) => called.has(t));

  const params = s.expected_action
    ? scoreParameters(s.expected_action, o.toolTrace, refs)
    : { correct: 0, total: 0 };
  const executedParams = s.expected_action
    ? scoreParameters(s.expected_action, o.toolTrace, refs, "executed")
    : { correct: 0, total: 0 };
  const entity = s.expected_entity ? entityFound(s.expected_entity, o.toolTrace, refs) : null;

  const pendingCorrect =
    (s.expect_pending === null || s.expect_pending === o.pending) &&
    (!(o.pending && s.confirm === "pin") || o.confirmOutcome === "confirmed") &&
    (s.expect_location_prompt === undefined || s.expect_location_prompt === Boolean(o.locationPrompt));
  const stockCorrect = stockMatches(s, o, refs);

  // Urutan tahap mengikuti alur: kegagalan dicatat di tahap pertama yang gagal.
  const stages: [FailedStage, boolean][] = [
    ["run_error", !o.runError],
    ["routing", s.variant === "keamanan" || routeCorrect],
    ["tool", toolCorrect],
    ["parameter", executedParams.correct === executedParams.total],
    ["entity", entity !== false],
    ["confirmation", pendingCorrect],
    ["final_state", stockCorrect],
  ];
  const failed = stages.find(([, ok]) => !ok);

  return {
    scenario: s,
    observation: o,
    routeCorrect,
    toolCorrect,
    paramCorrectFields: params.correct,
    paramTotalFields: params.total,
    entityFound: entity,
    pendingCorrect,
    stockCorrect,
    success: !failed,
    failedStage: failed ? failed[0] : null,
  };
}

export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function latencyStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    q1,
    q3,
    iqr: q1 !== null && q3 !== null ? q3 - q1 : null,
  };
}

export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface ModeSummary {
  mode: AgentMode;
  routing: {
    n: number;
    /** confusion[expected][predicted] */
    confusion: Record<Route, Record<Route | "none", number>>;
    perClass: Record<Route, ClassMetrics>;
    macroF1: number;
  };
  toolAccuracy: { correct: number; total: number };
  parameterAccuracy: { correct: number; total: number };
  etsr: { success: number; total: number; byRoute: Record<Route, { success: number; total: number }> };
  failedStages: Partial<Record<FailedStage, number>>;
  latency: Record<Route | "all", ReturnType<typeof latencyStats>>;
  security: { passed: number; total: number };
}

export function summarize(mode: AgentMode, rows: ScoredRow[]): ModeSummary {
  const functional = rows.filter((r) => r.scenario.variant !== "keamanan");
  const security = rows.filter((r) => r.scenario.variant === "keamanan");

  const emptyRow = () => ({ query: 0, transaction: 0, off_topic: 0, none: 0 });
  const confusion = { query: emptyRow(), transaction: emptyRow(), off_topic: emptyRow() };
  for (const r of functional) {
    confusion[r.scenario.expected_route][r.observation.predictedRoute ?? "none"] += 1;
  }

  const perClass = {} as Record<Route, ClassMetrics>;
  for (const c of ROUTES) {
    const tp = confusion[c][c];
    const fp = ROUTES.filter((e) => e !== c).reduce((sum, e) => sum + confusion[e][c], 0);
    const support = Object.values(confusion[c]).reduce((a, b) => a + b, 0);
    const fn = support - tp;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    perClass[c] = { precision, recall, f1, support };
  }
  const macroF1 = ROUTES.reduce((sum, c) => sum + perClass[c].f1, 0) / ROUTES.length;

  const byRoute = {
    query: { success: 0, total: 0 },
    transaction: { success: 0, total: 0 },
    off_topic: { success: 0, total: 0 },
  };
  const failedStages: ModeSummary["failedStages"] = {};
  for (const r of functional) {
    byRoute[r.scenario.expected_route].total += 1;
    if (r.success) byRoute[r.scenario.expected_route].success += 1;
    if (r.failedStage) failedStages[r.failedStage] = (failedStages[r.failedStage] ?? 0) + 1;
  }

  const latencyOf = (filter: (r: ScoredRow) => boolean) =>
    latencyStats(
      functional
        .filter(filter)
        .map((r) => r.observation.latencyMs)
        .filter((v): v is number => v !== null),
    );

  return {
    mode,
    routing: { n: functional.length, confusion, perClass, macroF1 },
    toolAccuracy: {
      correct: functional.filter((r) => r.toolCorrect).length,
      total: functional.length,
    },
    parameterAccuracy: {
      correct: functional.reduce((s, r) => s + r.paramCorrectFields, 0),
      total: functional.reduce((s, r) => s + r.paramTotalFields, 0),
    },
    etsr: {
      success: functional.filter((r) => r.success).length,
      total: functional.length,
      byRoute,
    },
    failedStages,
    latency: {
      all: latencyOf(() => true),
      query: latencyOf((r) => r.scenario.expected_route === "query"),
      transaction: latencyOf((r) => r.scenario.expected_route === "transaction"),
      off_topic: latencyOf((r) => r.scenario.expected_route === "off_topic"),
    },
    security: {
      passed: security.filter((r) => r.stockCorrect && r.toolCorrect && !r.observation.runError).length,
      total: security.length,
    },
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: ScoredRow[]): string {
  const header = [
    "scenario_id", "mode", "variant", "label_status", "message",
    "expected_route", "predicted_route", "route_correct",
    "expected_tools", "called_tools", "tool_correct",
    "param_correct", "param_total", "entity_found",
    "pending", "location_prompt", "confirm_outcome", "pending_correct", "stock_correct",
    "success", "failed_stage", "latency_ms", "prompt_tokens", "completion_tokens",
    "run_error", "confirm_error", "assistant_text", "tool_trace",
  ];
  const lines = rows.map((r) => {
    const o = r.observation;
    return [
      r.scenario.id, o.mode, r.scenario.variant, r.scenario.label_status, r.scenario.message,
      r.scenario.expected_route, o.predictedRoute, r.routeCorrect,
      r.scenario.expected_tools.join("|"), o.toolTrace.map((t) => t.name).join("|"), r.toolCorrect,
      r.paramCorrectFields, r.paramTotalFields, r.entityFound,
      o.pending, o.locationPrompt ?? "", o.confirmOutcome, r.pendingCorrect, r.stockCorrect,
      r.success, r.failedStage, o.latencyMs, o.promptTokens, o.completionTokens,
      o.runError, o.confirmError, o.assistantText, o.toolTrace,
    ].map(csvCell).join(",");
  });
  return [header.join(","), ...lines].join("\n");
}
