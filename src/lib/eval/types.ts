import type { AgentMode, AgentTurnResult, ProcessStep } from "@/src/lib/agents/orchestrator";
import type { ModelCallStats } from "@/src/lib/agents/inference-stats";

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
  /** Sistem harus menahan transaksi dan meminta staf memilih lokasi. */
  expect_location_prompt?: boolean;
  /** Sistem harus menahan transaksi dan meminta staf memilih barang (nama barang ambigu). */
  expect_product_prompt?: boolean;
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
  /** Nomor ulangan pada run berulang (2, 3, …); kosong = ulangan 1 / run biasa. */
  repetition?: number;
  /** Kelas akhir giliran (Router + koreksi kode); dasar routeCorrect. */
  predictedRoute: Route | null;
  /**
   * Tebakan asli Router sebelum koreksi kode (guardRoute, giliran transaksi yang
   * ternyata hanya membaca stok). Kosong di mode single_agent dan di run lama.
   */
  routerPredictedRoute?: Route | null;
  /** Rute diputuskan kode tanpa memanggil Router; eksekusi ini tidak ikut akurasi "Router saja". */
  routedByCode?: boolean;
  assistantText: string;
  modelReplies?: string[];
  /** Langkah "Lihat proses" yang sama dengan /chat. */
  processSteps?: ProcessStep[];
  /** Waktu, token, dan kecepatan tiap panggilan model (Router, Agent) pada eksekusi ini. */
  modelCalls?: ModelCallStats[];
  toolTrace: AgentTurnResult["toolTrace"];
  pending: boolean;
  /** Ada saat updateStock ditahan untuk pemilihan lokasi. */
  locationPrompt?: {
    suggestedLocationId: string | null;
    suggestionReason: "mentioned" | "nearest" | null;
  };
  /** Ada saat nama barang dari model cocok ke beberapa produk dan staf diminta memilih. */
  productPrompt?: { candidateIds: string[] };
  confirmOutcome: ConfirmOutcome;
  confirmError?: string;
  stockBefore: StockSnapshot;
  stockAfter: StockSnapshot;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  /** Opsi ablasi panjang prompt aktif saat eksekusi ini (lihat prompt-padding.ts). */
  promptPadding?: boolean;
  /** Pengaman profil model dimatikan saat eksekusi ini (kondisi "model mentah"; lihat model-profile.ts). */
  codeGuardsOff?: boolean;
  /** WebLLM menolak grammar sebelum atau selama eksekusi ini, jadi panggilan model berjalan tanpa batasan bentuk. */
  grammarUnavailable?: boolean;
  /**
   * Giliran ini memakai cache perangkat atau pencarian produknya gagal karena server
   * (lihat server-check.ts). Eksekusi seperti ini tidak menguji model.
   */
  serverFallback?: boolean;
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
  /** Tebakan asli Router benar? null/kosong = tidak ada Router (single) atau run lama. */
  routerRouteCorrect?: boolean | null;
  toolCorrect: boolean;
  paramCorrectFields: number;
  paramTotalFields: number;
  entityFound: boolean | null;
  pendingCorrect: boolean;
  stockCorrect: boolean;
  success: boolean;
  failedStage: FailedStage | null;
  /** Hanya skenario keamanan (null untuk lainnya); lihat scoreScenario. */
  securityInvariantHeld: boolean | null;
  /**
   * Kebenaran isi jawaban (terpisah dari ETSR): null = tidak dinilai, "review" =
   * heuristik ragu dan perlu dibaca manual.
   */
  faithfulness: Faithfulness;
}

export type Faithfulness = "faithful" | "unfaithful" | "review" | null;
