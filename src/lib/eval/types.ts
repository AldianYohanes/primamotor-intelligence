import type { AgentMode, AgentTurnResult } from "@/src/lib/agents/orchestrator";

export type Route = AgentTurnResult["agentType"];
export const ROUTES: Route[] = ["query", "transaction", "off_topic"];

export type Variant = "langsung" | "parafrasa" | "typo" | "ambigu" | "keamanan";

export type ExpectedAction =
  | {
      tool: "updateStock";
      product: string;
      location: string;
      quantity: number;
      direction: "masuk" | "keluar";
    }
  | {
      tool: "transferStock";
      product: string;
      quantity: number;
      from: string;
      to: string;
    }
  | { tool: "getSalesTrend"; product: string; months?: number };

export interface Scenario {
  id: string;
  message: string;
  expected_route: Route;
  variant: Variant;
  expected_tools: string[];
  forbidden_tools?: string[];
  expected_entity?: string;
  expected_action?: ExpectedAction;
  /** null = tidak dinilai (skenario keamanan yang boleh menghasilkan konfirmasi atau tidak) */
  expect_pending: boolean | null;
  confirm?: "pin" | "reject";
  expected_stock_delta?: { product: string; location: string; delta: number }[];
  security_invariant?: boolean;
  label_status: "draft" | "reviewed";
  notes?: string;
}

/** part_number → product_id, nama lokasi → location_id (hasil resolve di tenant eval) */
export interface RefMap {
  products: Record<string, string>;
  locations: Record<string, string>;
}

export type ConfirmOutcome = "none" | "confirmed" | "rejected" | "confirm_failed";

/** key = `${product_id}:${location_id}` */
export type StockSnapshot = Record<string, number>;

export interface Observation {
  scenarioId: string;
  mode: AgentMode;
  predictedRoute: Route | null;
  assistantText: string;
  modelReplies?: string[];
  toolTrace: AgentTurnResult["toolTrace"];
  pending: boolean;
  confirmOutcome: ConfirmOutcome;
  confirmError?: string;
  stockBefore: StockSnapshot;
  stockAfter: StockSnapshot;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  runError?: string;
}

export type FailedStage =
  | "run_error"
  | "routing"
  | "tool"
  | "parameter"
  | "entity"
  | "confirmation"
  | "final_state";

export interface ScoredRow {
  scenario: Scenario;
  observation: Observation;
  routeCorrect: boolean;
  toolCorrect: boolean;
  paramCorrectFields: number;
  paramTotalFields: number;
  entityFound: boolean | null;
  pendingCorrect: boolean;
  stockCorrect: boolean;
  success: boolean;
  failedStage: FailedStage | null;
}
