/**
 * Statistik inferensi per giliran untuk ditampilkan ke staf/penguji: waktu tiap
 * panggilan model, token, dan kecepatan dari `usage.extra` WebLLM. Hanya dicatat
 * dan ditampilkan; tidak memengaruhi jalannya agent.
 */

/** Bagian `usage` WebLLM yang dipakai di sini; field `extra` tidak selalu ada. */
export interface WebLlmUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  extra?: {
    e2e_latency_s?: number;
    prefill_tokens_per_s?: number;
    decode_tokens_per_s?: number;
    time_to_first_token_s?: number;
  };
}

export interface ModelCallStats {
  label: "Router" | "Agent";
  status: "running" | "done";
  durationMs: number;
  /** Chunk teks yang sudah keluar selama streaming (≈ token). */
  liveTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  prefillTokPerS?: number;
  decodeTokPerS?: number;
  timeToFirstTokenMs?: number;
}

export interface InferenceSnapshot {
  modelId: string;
  calls: ModelCallStats[];
}

type Clock = () => number;

export class InferenceMeter {
  private calls: (ModelCallStats & { startedAt: number })[] = [];

  constructor(
    private readonly modelId: string,
    private readonly onUpdate?: (snapshot: InferenceSnapshot) => void,
    private readonly now: Clock = () => performance.now(),
  ) {}

  startCall(label: ModelCallStats["label"]): number {
    this.calls.push({ label, status: "running", durationMs: 0, liveTokens: 0, startedAt: this.now() });
    this.emit();
    return this.calls.length - 1;
  }

  /** Dipanggil tiap chunk teks streaming. */
  tick(index: number): void {
    const call = this.calls[index];
    if (!call || call.status === "done") return;
    const now = this.now();
    if (call.liveTokens === 0) call.timeToFirstTokenMs = now - call.startedAt;
    call.liveTokens += 1;
    call.durationMs = now - call.startedAt;
    this.emit();
  }

  finishCall(index: number, usage: WebLlmUsage | null | undefined): void {
    const call = this.calls[index];
    if (!call) return;
    call.status = "done";
    call.durationMs = this.now() - call.startedAt;
    if (usage) {
      call.promptTokens = usage.prompt_tokens;
      call.completionTokens = usage.completion_tokens;
      const extra = usage.extra;
      if (extra?.prefill_tokens_per_s) call.prefillTokPerS = extra.prefill_tokens_per_s;
      if (extra?.decode_tokens_per_s) call.decodeTokPerS = extra.decode_tokens_per_s;
      if (extra?.time_to_first_token_s) call.timeToFirstTokenMs = extra.time_to_first_token_s * 1000;
    }
    this.emit();
  }

  snapshot(): InferenceSnapshot {
    return {
      modelId: this.modelId,
      calls: this.calls.map(({ startedAt: _startedAt, ...c }) => ({ ...c })),
    };
  }

  private emit(): void {
    this.onUpdate?.(this.snapshot());
  }
}

export interface InferenceTotals {
  calls: number;
  modelMs: number;
  promptTokens: number;
  completionTokens: number;
  /** Rata-rata tertimbang token keluaran; kosong kalau WebLLM tidak mengirim kecepatan. */
  decodeTokPerS?: number;
}

export function inferenceTotals(snapshot: InferenceSnapshot): InferenceTotals {
  let promptTokens = 0;
  let completionTokens = 0;
  let modelMs = 0;
  let decodeTokens = 0;
  let decodeSeconds = 0;
  for (const c of snapshot.calls) {
    modelMs += c.durationMs;
    promptTokens += c.promptTokens ?? 0;
    const out = c.completionTokens ?? c.liveTokens;
    completionTokens += out;
    if (c.decodeTokPerS && out > 0) {
      decodeTokens += out;
      decodeSeconds += out / c.decodeTokPerS;
    }
  }
  return {
    calls: snapshot.calls.length,
    modelMs,
    promptTokens,
    completionTokens,
    ...(decodeSeconds > 0 && { decodeTokPerS: decodeTokens / decodeSeconds }),
  };
}

/** Kecepatan keluaran sementara dari panggilan yang sedang berjalan (token per detik). */
export function liveTokPerS(call: ModelCallStats): number | undefined {
  if (call.liveTokens < 2 || call.timeToFirstTokenMs === undefined) return undefined;
  const decodingMs = call.durationMs - call.timeToFirstTokenMs;
  return decodingMs > 0 ? ((call.liveTokens - 1) * 1000) / decodingMs : undefined;
}

/**
 * Durasi singkat: 950 → "0,95s", 3_900 → "3,9s", 42_000 → "42s", 83_000 → "1m23s".
 * `precise: false` membulatkan ke detik (dipakai stopwatch yang berjalan).
 */
export function formatDuration(ms: number, { precise = true }: { precise?: boolean } = {}): string {
  const safe = Math.max(0, ms);
  if (safe < 60_000) {
    const s = safe / 1000;
    if (!precise || s >= 10) return `${Math.floor(s)}s`;
    return `${s.toLocaleString("id-ID", { maximumFractionDigits: s < 1 ? 2 : 1 })}s`;
  }
  const total = Math.floor(safe / 1000);
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}

export function formatRate(tokPerS: number | undefined): string {
  return tokPerS === undefined ? "–" : `${tokPerS.toLocaleString("id-ID", { maximumFractionDigits: 1 })} tok/s`;
}
