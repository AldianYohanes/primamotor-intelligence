import type { AgentMode } from "@/src/lib/agents/orchestrator";
import type { Scenario, ScoredRow } from "@/src/lib/eval/types";

/**
 * Autosave run /eval di browser: setiap eksekusi yang selesai langsung disimpan,
 * sehingga reset GPU (TDR) atau muat ulang halaman tidak menghapus hasil dan run
 * bisa dilanjutkan dari eksekusi berikutnya. Hanya untuk kenyamanan pengujian;
 * sumber kebenaran tetap file JSON yang diunduh.
 */
export const RUN_STORE_KEY = "eval-run-autosave";

/** Baris dengan scenario disimpan sebagai id (seperti di JSON ekspor). */
export type StoredRow = Omit<ScoredRow, "scenario"> & { scenario: string };

export interface Interruption {
  kind: "gpu" | "error" | "stopped";
  message: string;
  detail?: string;
  during: string;
  at: string;
}

export interface SavedRun {
  scenarioVersion: string;
  startedAt: string;
  modelId: string;
  /** Urutan eksekusi asli: skenario terpilih × mode, diselang-seling per skenario. */
  plan: { scenarioId: string; mode: AgentMode }[];
  environment: unknown;
  /** Opsi ablasi padding saat run dimulai; dipulihkan saat run dilanjutkan sesudah muat ulang halaman. */
  promptPadding?: boolean;
  rows: StoredRow[];
  /** Penghentian sebelumnya (run dilanjutkan sesudahnya). */
  interruptions: Interruption[];
  /** Setiap kali run dilanjutkan, beserta lingkungan perangkat saat itu (prefill, GPU). */
  resumed: { at: string; environment: unknown }[];
  updatedAt: string;
}

export function buildPlan(scenarioIds: string[], modes: AgentMode[]): SavedRun["plan"] {
  return scenarioIds.flatMap((scenarioId) => modes.map((mode) => ({ scenarioId, mode })));
}

/** Eksekusi rencana yang belum punya baris hasil, urutan rencana dipertahankan. */
export function remainingPlan(plan: SavedRun["plan"], rows: { scenario: string; observation: { mode: AgentMode } }[]) {
  const done = new Set(rows.map((r) => `${r.scenario}|${r.observation.mode}`));
  return plan.filter((p) => !done.has(`${p.scenarioId}|${p.mode}`));
}

export function toStoredRow(row: ScoredRow): StoredRow {
  return { ...row, scenario: row.scenario.id };
}

export function fromStoredRows(rows: StoredRow[], scenarios: Scenario[]): ScoredRow[] {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  return rows.flatMap((r) => {
    const scenario = byId.get(r.scenario);
    return scenario ? [{ ...r, scenario }] : [];
  });
}

export function loadSavedRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(RUN_STORE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as SavedRun;
    return Array.isArray(run.plan) && Array.isArray(run.rows) ? run : null;
  } catch {
    return null;
  }
}

/** false bila penyimpanan diblokir atau penuh; run tetap jalan, hanya tanpa autosave. */
export function saveRun(run: SavedRun): boolean {
  try {
    localStorage.setItem(RUN_STORE_KEY, JSON.stringify({ ...run, updatedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedRun() {
  try {
    localStorage.removeItem(RUN_STORE_KEY);
  } catch {
    // Penyimpanan diblokir: tidak ada yang perlu dihapus.
  }
}

/** Perkiraan sisa waktu dari median durasi eksekusi sejauh ini (ms), null bila belum ada data. */
export function estimateRemainingMs(durationsMs: number[], remaining: number): number | null {
  if (durationsMs.length === 0) return null;
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median * remaining);
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} j ${m} mnt` : `${m} mnt`;
}
