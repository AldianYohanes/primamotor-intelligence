import type { LocationChoice } from "@/src/lib/agents/location-choice";
import type { ProcessStep } from "@/src/lib/agents/process-trace";

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface PendingConfirmation {
  audit_log_id: string;
  tool_name: "updateStock" | "transferStock";
  message: string;
  /** Jumlah tidak wajar (largeQuantityWarning); ditampilkan di dialog PIN. */
  warning?: string;
}

export interface AgentTurnResult {
  /**
   * Kelas akhir giliran: keluaran Router, dikoreksi pengaman kode (guardRoute,
   * giliran transaksi yang ternyata cuma membaca stok jadi "query"). Mode single:
   * disimpulkan dari jejak alat.
   */
  agentType: "query" | "transaction" | "off_topic";
  /**
   * Tebakan asli Router sebelum koreksi kode apa pun; dasar akurasi "Router saja"
   * di /eval. Kosong di mode single_agent (tidak ada Router).
   */
  routerAgentType?: "query" | "transaction" | "off_topic";
  assistantText: string;
  pendingConfirmation?: PendingConfirmation;
  /** Transaksi ditahan sampai staf memilih produk atau lokasi. */
  choice?: MutationChoice;
  /**
   * args = keluaran asli model; resolvedArgs = tulisan model dipetakan ke UUID
   * (dasar ParameterAccuracy); executedArgs = yang benar-benar dikirim ke server.
   */
  toolTrace: { name: string; args: unknown; result: unknown; resolvedArgs?: unknown; executedArgs?: unknown }[];
  latencyMs?: number;
  /** Keluaran mentah model per iterasi, untuk analisis evaluasi. */
  modelReplies?: string[];
  usage?: { promptTokens: number; completionTokens: number } | null;
  /** Langkah "Lihat proses" (process-trace.ts), ditampilkan ke staf. */
  processSteps?: ProcessStep[];
}

/**
 * multi_agent = Router lalu agent spesialis (arsitektur utama).
 * single_agent = baseline evaluasi: satu prompt gabungan, tanpa Router.
 */
export type AgentMode = "multi_agent" | "single_agent";


/** Giliran dihentikan staf; `partialText` = bagian balasan yang sempat tampil. */
export class TurnStoppedError extends Error {
  constructor(public readonly partialText = "") {
    super("Dihentikan");
    this.name = "TurnStoppedError";
  }
}


export type MutationTool = "updateStock" | "transferStock";

export interface ProductChoice {
  kind: "product";
  toolName: MutationTool;
  /** Argumen dari model; product_id diisi dari pilihan staf. */
  args: Record<string, unknown>;
  userMessage: string;
  /** Pesan asli staf untuk audit log; kosong = sama dengan userMessage. */
  originalMessage?: string;
  options: { id: string; name: string; detail: string }[];
}

export type MutationChoice = ProductChoice | LocationChoice;

export interface MutationOutcome {
  message: string;
  pendingConfirmation?: PendingConfirmation;
  choice?: MutationChoice;
  /** Ringkasan untuk toolTrace/evaluasi. */
  result: Record<string, unknown>;
  /** Nama barang & lokasi TULISAN MODEL dipetakan ke UUID, tanpa bantuan kata staf (dasar ParameterAccuracy). */
  resolvedArgs?: Record<string, unknown>;
  /** Argumen yang benar-benar dikirim ke server. */
  executedArgs?: Record<string, unknown>;
}
