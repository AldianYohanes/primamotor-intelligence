"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { createClient } from "@/src/lib/supabase/client";
import { refreshCatalog } from "@/src/lib/cache/indexeddb";
import { isWebGPUAvailable } from "@/src/lib/agents/webgpu-support";
import { MODEL_ID, MODEL_OPTIONS } from "@/src/lib/agents/model-options";
import type { AgentMode, ProcessStep } from "@/src/lib/agents/orchestrator";
import { ProcessTimeline } from "@/src/components/chat/ProcessDetails";
import { EvalRowDetail } from "@/src/components/eval/EvalRowDetail";
import { CallTable, InferenceStatsButton, LiveInferenceLine, type TurnRecord } from "@/src/components/chat/InferenceStats";
import type { InferenceSnapshot } from "@/src/lib/agents/inference-stats";
import scenarioFile from "@/src/lib/eval/scenarios.json";
import { scoreScenario, stockKey, summarize, toCsv, type ModeSummary } from "@/src/lib/eval/scoring";
import {
  buildPlan,
  clearSavedRun,
  estimateRemainingMs,
  formatDuration,
  fromStoredRows,
  loadSavedRun,
  remainingPlan,
  saveRun,
  toStoredRow,
  type Interruption,
  type SavedRun,
} from "@/src/lib/eval/run-store";
import { holdWakeLock } from "@/src/lib/pwa/wake-lock";
import { alertUser, notificationPermission, primeAlerts } from "@/src/lib/eval/alerts";
import { MAX_CONSECUTIVE_SERVER_FALLBACKS, checkAgentServer, hasServerFallback } from "@/src/lib/eval/server-check";
import type {
  ConfirmOutcome,
  Observation,
  RefMap,
  Scenario,
  ScoredRow,
  StockSnapshot,
} from "@/src/lib/eval/types";

import { EVAL_DEVICE_POSITION, EVAL_TENANT_SLUG } from "@/src/lib/eval/tenant";
import {
  getGpuPreference,
  gpuLabel,
  probeGpus,
  recommendGpu,
  setGpuPreference,
  type GpuAdapterSummary,
  type GpuPowerPreference,
  type GpuProbe,
  type GpuRecommendation,
} from "@/src/lib/agents/gpu-preference";
import {
  PREFILL_CHUNK_OPTIONS,
  getPrefillChunkPreference,
  setPrefillChunkPreference,
} from "@/src/lib/agents/prefill-preference";
import { isPromptPaddingOn, setPromptPadding } from "@/src/lib/agents/prompt-padding";

const fixedDevicePosition = () => Promise.resolve(EVAL_DEVICE_POSITION);
const SCENARIOS = scenarioFile.scenarios as unknown as Scenario[];

interface Props {
  businessId: string;
  businessSlug: string;
  staffId: string;
  username: string;
}

type ModeChoice = AgentMode | "both";

class GpuDeviceError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

function pct(n: number, d: number) {
  return d === 0 ? "–" : `${((n / d) * 100).toFixed(1)}%`;
}

function ms(v: number | null) {
  return v === null ? "–" : `${Math.round(v)} ms`;
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type GpuInfo = GpuAdapterSummary;

/** Adapter yang benar-benar dipakai engine: sesuai preferensi GPU tersimpan. */
function isStopped(err: unknown) {
  return err instanceof Error && err.name === "TurnStoppedError";
}

async function readGpuInfo(): Promise<GpuInfo | null> {
  const probes = await probeGpus();
  const pref = getGpuPreference() ?? "high-performance";
  return probes.find((p) => p.preference === pref)?.adapter ?? null;
}

/** Versi kode yang sedang jalan (diisi next.config.mjs saat dev/build). */
const CODE_VERSION = {
  commit: process.env.NEXT_PUBLIC_GIT_COMMIT ?? "unknown",
  branch: process.env.NEXT_PUBLIC_GIT_BRANCH ?? "unknown",
};

async function collectEnvironment(modelId: string) {
  return {
    model: modelId,
    codeCommit: CODE_VERSION.commit,
    codeBranch: CODE_VERSION.branch,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    gpu: await readGpuInfo(),
    /** null = bawaan web-llm (high-performance); lihat gpu-preference.ts. */
    gpuPreference: getGpuPreference(),
    /** Diisi setelah model dimuat; lihat prefill-preference.ts. */
    prefillChunkSize: null as { effective: number | null; modelDefault: number | null } | null,
    /** Ablasi: prompt agent spesialis diisi sampai sepanjang prompt single-agent; lihat prompt-padding.ts. */
    promptPadding: isPromptPaddingOn(),
  };
}

export function EvalRunner({ businessId, businessSlug, staffId, username }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [modeChoice, setModeChoice] = useState<ModeChoice>("both");
  const [idFilter, setIdFilter] = useState("");
  // Run berulang: seluruh rencana diulang N kali, data eval direset di awal ulangan 2 dst.
  const [repetitions, setRepetitions] = useState(1);
  // Lanjut otomatis sesudah GPU putus: maks AUTO_RESUME_MAX kali per run, jeda AUTO_RESUME_DELAY_MS.
  const [autoResume, setAutoResume] = useState(true);
  const autoResumeCount = useRef(0);
  const autoResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pin, setPin] = useState("");
  const [running, setRunning] = useState(false);
  const stopRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState("Belum dijalankan.");
  const [warning, setWarning] = useState<string | null>(null);
  const [rows, setRows] = useState<ScoredRow[]>([]);
  const [environment, setEnvironment] = useState<Awaited<ReturnType<typeof collectEnvironment>> | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  // Ikut diekspor supaya run yang berhenti di tengah bisa ditelusuri dari JSON saja.
  const [stoppedReason, setStoppedReason] = useState<{
    kind: "gpu" | "error" | "stopped";
    message: string;
    /** Keterangan asli browser untuk error GPU (alasan device lost dsb.). */
    detail?: string;
    during: string;
    at: string;
  } | null>(null);
  const [modelId, setModelId] = useState<string>(MODEL_ID);
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null | "loading">("loading");
  const [alertsOn, setAlertsOn] = useState(true);
  const [notifPermission, setNotifPermission] = useState<ReturnType<typeof notificationPermission>>("default");
  const [liveSteps, setLiveSteps] = useState<ProcessStep[]>([]);
  // Baris hasil yang detailnya terbuka (kunci: indeks baris).
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  // Statistik model skenario terakhir (maks. 20) untuk tombol/modal statistik.
  const [evalTurns, setEvalTurns] = useState<TurnRecord[]>([]);
  const [prefillChunk, setPrefillChunk] = useState<number | null>(null);
  const [padPrompt, setPadPrompt] = useState(false);
  // Opsi ablasi selalu mulai mati di setiap kunjungan halaman.
  useEffect(() => setPromptPadding(false), []);
  const [gpuProbes, setGpuProbes] = useState<GpuProbe[] | null>(null);
  const [gpuPref, setGpuPref] = useState<GpuPowerPreference | null>(null);
  // Ganti GPU baru berlaku untuk engine baru; engine yang sudah dimuat tetap di GPU lama.
  const [gpuPrefChanged, setGpuPrefChanged] = useState(false);
  const [savedRun, setSavedRun] = useState<SavedRun | null>(null);
  const [interruptions, setInterruptions] = useState<Interruption[]>([]);
  // Modal besar saat run berhenti karena error, supaya terlihat dari jauh (bukan hanya teks status).
  const [errorModal, setErrorModal] = useState<{
    kind: "gpu" | "error";
    message: string;
    during: string;
    at: string;
    /** Diisi saat run akan dilanjutkan otomatis: waktu (Date.now) dan percobaan ke berapa. */
    autoResumeAt?: number;
    attempt?: number;
  } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    elapsedMs: number;
    etaMs: number | null;
  } | null>(null);

  useEffect(() => {
    setSavedRun(loadSavedRun());
    setPrefillChunk(getPrefillChunkPreference());
    setGpuPref(getGpuPreference());
    probeGpus().then(setGpuProbes);
  }, []);

  useEffect(() => {
    const sync = () => setNotifPermission(notificationPermission());
    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener("change", sync);
        sync();
      })
      .catch(sync);
    return () => status?.removeEventListener("change", sync);
  }, []);

  function enableAlerts() {
    primeAlerts();
  }

  useEffect(() => {
    readGpuInfo().then(setGpuInfo);
  }, [gpuPref]);

  const gpuRecommendation = gpuProbes ? recommendGpu(gpuProbes) : null;

  const isEvalTenant = businessSlug === EVAL_TENANT_SLUG;
  // Beberapa awalan dipisah koma, mis. "T-06, T-07, T-08, T-09, T-1".
  const prefixes = idFilter.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);
  const selected = SCENARIOS.filter((s) => prefixes.length === 0 || prefixes.some((p) => s.id.startsWith(p)));
  const modes: AgentMode[] = modeChoice === "both" ? ["multi_agent", "single_agent"] : [modeChoice];
  const needsPin = selected.some((s) => s.confirm === "pin");
  const draftCount = SCENARIOS.filter((s) => s.label_status !== "reviewed").length;
  const savedRunNeedsPin = Boolean(
    savedRun?.plan.some((p) => SCENARIOS.find((s) => s.id === p.scenarioId)?.confirm === "pin"),
  );

  const summaries: ModeSummary[] = useMemo(
    () =>
      (["multi_agent", "single_agent"] as AgentMode[])
        .map((m) => ({ m, r: rows.filter((row) => row.observation.mode === m) }))
        .filter(({ r }) => r.length > 0)
        .map(({ m, r }) => summarize(m, r)),
    [rows],
  );

  async function snapshotStock(): Promise<StockSnapshot> {
    const { data, error } = await supabase
      .from("stock")
      .select("product_id, location_id, quantity")
      .eq("business_id", businessId);
    if (error) throw new Error(`Gagal membaca stok: ${error.message}`);
    const snap: StockSnapshot = {};
    for (const r of data ?? []) {
      if (r.product_id && r.location_id) snap[stockKey(r.product_id, r.location_id)] = r.quantity;
    }
    return snap;
  }

  async function resolveRefs(): Promise<RefMap> {
    const [{ data: products, error: pErr }, { data: locations, error: lErr }] = await Promise.all([
      supabase.from("products").select("id, part_number").eq("business_id", businessId),
      supabase.from("locations").select("id, name").eq("business_id", businessId),
    ]);
    if (pErr || lErr) throw new Error("Gagal membaca produk/lokasi tenant eval");
    const refs: RefMap = { products: {}, locations: {} };
    for (const p of products ?? []) if (p.part_number) refs.products[p.part_number] = p.id;
    for (const l of locations ?? []) refs.locations[l.name] = l.id;

    const referenced = new Set<string>();
    for (const s of SCENARIOS) {
      if (s.expected_entity) referenced.add(s.expected_entity);
      if (s.expected_action) referenced.add(s.expected_action.product);
      for (const d of s.expected_stock_delta ?? []) referenced.add(d.product);
    }
    const missing = [...referenced].filter((p) => !refs.products[p]);
    if (missing.length > 0 || !refs.locations.Toko || !refs.locations.Gudang) {
      throw new Error(`Seed eval belum lengkap (produk hilang: ${missing.join(", ") || "-"}). Klik "Reset data eval" atau jalankan supabase/seed_eval.sql.`);
    }
    return refs;
  }

  async function checkTenantIsFresh() {
    const { count } = await supabase
      .from("agent_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);
    setWarning(
      count && count > 0
        ? `Tenant eval sudah punya ${count} audit log dari run sebelumnya. Hasil tetap valid (dinilai dari selisih stok), tapi skenario stok-kurang bisa berubah perilaku. Untuk run resmi, klik "Reset data eval" dulu.`
        : null,
    );
  }

  async function resetEvalData() {
    const lines = [
      "Reset data eval? Semua stok, percakapan, dan audit log tenant eval dihapus lalu dibuat ulang seperti supabase/seed_eval.sql.",
    ];
    if (savedRun) lines.push("Ada run tersimpan: kalau dilanjutkan sesudah reset, stok awalnya tidak sama dengan saat run itu dimulai.");
    if (!window.confirm(lines.join(" "))) return;
    setSeeding(true);
    setSeedStatus("Mereset data eval…");
    try {
      const res = await fetch("/api/eval/seed", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; transactions?: number };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSeedStatus(`Data eval direset (${new Date().toLocaleTimeString("id-ID")}, ${body.transactions ?? "?"} transaksi awal).`);
      setWarning(null);
    } catch (err) {
      setSeedStatus(`Reset gagal: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSeeding(false);
    }
  }

  async function createConversation(mode: AgentMode): Promise<string> {
    const { data, error } = await supabase
      .from("agent_conversations")
      .insert({ business_id: businessId, staff_id: staffId, channel: `eval:${mode}` })
      .select("id")
      .single();
    if (error || !data) throw new Error("Gagal membuat percakapan eval");
    return data.id;
  }

  async function resolvePending(
    toolName: "updateStock" | "transferStock",
    auditLogId: string,
    scenario: Scenario,
  ): Promise<{ outcome: ConfirmOutcome; error?: string }> {
    if (scenario.confirm === "pin" && pin) {
      const endpoint =
        toolName === "updateStock" ? "/api/agent/tools/update-stock/confirm" : "/api/agent/tools/transfer-stock/confirm";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_log_id: auditLogId, staff_id: staffId, business_slug: businessSlug, username, pin }),
      });
      if (res.ok) return { outcome: "confirmed" };
      const body = await res.json().catch(() => ({}));
      return { outcome: "confirm_failed", error: body.error ?? `HTTP ${res.status}` };
    }
    // Skenario keamanan, pembatalan, atau konfirmasi yang tidak diharapkan: selalu Batal.
    await fetch("/api/agent/tools/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audit_log_id: auditLogId }),
    });
    return { outcome: "rejected" };
  }

  function buildExport(args: {
    rows: ScoredRow[];
    startedAt: string | null;
    environment: unknown;
    stoppedReason: Interruption | null;
    interruptions: Interruption[];
    resumed: SavedRun["resumed"];
  }) {
    const byMode = (["multi_agent", "single_agent"] as AgentMode[])
      .map((m) => args.rows.filter((r) => r.observation.mode === m))
      .filter((r) => r.length > 0)
      .map((r) => summarize(r[0].observation.mode, r));
    return JSON.stringify(
      {
        startedAt: args.startedAt,
        scenarioVersion: scenarioFile.version,
        draftLabels: draftCount,
        environment: args.environment,
        resumed: args.resumed,
        interruptions: args.interruptions,
        stoppedReason: args.stoppedReason,
        summaries: byMode,
        rows: args.rows.map((r) => ({ ...r, scenario: r.scenario.id })),
      },
      null,
      2,
    );
  }

  function downloadResults(json: string, csvRows: ScoredRow[], at: string | null) {
    download(`eval-${at ?? "run"}.json`, json, "application/json");
    download(`eval-${at ?? "run"}.csv`, toCsv(csvRows), "text/csv");
  }

  // Esc menghentikan run yang sedang berjalan.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopRef.current?.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  function cancelAutoResume() {
    if (autoResumeTimer.current) clearTimeout(autoResumeTimer.current);
    autoResumeTimer.current = null;
  }

  async function run(resume?: SavedRun, opts: { auto?: boolean } = {}) {
    if (!isEvalTenant) return;
    cancelAutoResume();
    if (!opts.auto) autoResumeCount.current = 0;
    if (resume && resume.modelId !== modelId) {
      setStatus(`Run tersimpan memakai ${resume.modelId}. Pilih model yang sama untuk melanjutkan.`);
      return;
    }
    if (resume && resume.scenarioVersion !== scenarioFile.version) {
      setStatus(`Run tersimpan memakai skenario versi ${resume.scenarioVersion}, sekarang ${scenarioFile.version}. Tidak bisa dilanjutkan.`);
      return;
    }
    // Muat ulang halaman mereset opsi ablasi; pulihkan dari run tersimpan supaya seluruh run
    // memakai konfigurasi yang sama (run 10 Okt 2026 kehilangan padding setelah resume kedua).
    if (resume && typeof resume.promptPadding === "boolean" && resume.promptPadding !== isPromptPaddingOn()) {
      setPadPrompt(resume.promptPadding);
      setPromptPadding(resume.promptPadding);
    }
    if (alertsOn) enableAlerts();
    let resetEngine: (() => void) | undefined;
    const releaseWake = holdWakeLock();
    const controller = new AbortController();
    stopRef.current = controller;
    const runStartedAt = resume?.startedAt ?? new Date().toISOString();
    const plan = resume?.plan ?? buildPlan(selected.map((s) => s.id), modes, repetitions);
    const totalRepetitions = Math.max(1, ...plan.map((p) => p.repetition ?? 1));
    const collected: ScoredRow[] = resume ? fromStoredRows(resume.rows, SCENARIOS) : [];
    const interruptions: Interruption[] = resume?.interruptions ?? [];
    const resumed: SavedRun["resumed"] = resume?.resumed ?? [];
    let runEnvironment: unknown = resume?.environment ?? null;
    // Dikunci di awal run: nilai awal dipertahankan sepanjang run, juga lintas resume.
    const runPadding = typeof resume?.promptPadding === "boolean" ? resume.promptPadding : isPromptPaddingOn();
    let autosaveOk = true;
    const persist = () => {
      autosaveOk = saveRun({
        scenarioVersion: scenarioFile.version,
        startedAt: runStartedAt,
        modelId,
        plan,
        environment: runEnvironment,
        promptPadding: runPadding,
        rows: collected.map(toStoredRow),
        interruptions,
        resumed,
        updatedAt: "",
      });
    };

    setRunning(true);
    setRows([...collected]);
    setStoppedReason(null);
    setInterruptions(interruptions);
    setErrorModal(null);
    let during = "persiapan";
    setStartedAt(runStartedAt);
    let stop: Interruption | null = null;
    try {
      if (!isWebGPUAvailable()) throw new Error("Browser ini tidak mendukung WebGPU.");
      setStatus("Memeriksa server pencarian stok…");
      const serverCheck = await checkAgentServer();
      if (!serverCheck.ok) {
        throw new Error(
          `Server pencarian stok tidak bisa dipakai (${serverCheck.reason}). Run tidak dimulai karena jawaban stok akan datang dari cache lama dan hasilnya tidak valid.`,
        );
      }
      // Katalog untuk pengaman rute profil model kecil; run tidak memakai halaman chat yang biasanya memuatnya.
      await refreshCatalog(supabase, businessId).catch(() => {});
      setStatus("Memeriksa data tenant eval…");
      const refs = await resolveRefs();
      await checkTenantIsFresh();

      const [
        { getWebLLMEngine, resetWebLLMEngine, refreshPrefillChunkSize, getEffectivePrefillChunkSize },
        { runAgentTurn },
      ] = await Promise.all([
        import("@/src/lib/agents/webllm-engine"),
        import("@/src/lib/agents/orchestrator"),
      ]);
      resetEngine = resetWebLLMEngine;
      let segmentEnvironment = await collectEnvironment(modelId);
      setEnvironment(segmentEnvironment);

      // Error GPU (uncaptured/device lost) tidak me-reject promise inferensi, jadi
      // tanpa ini run akan menggantung selamanya.
      let failDevice: (e: Error) => void = () => {};
      const deviceFailure = new Promise<never>((_, reject) => {
        // webllm-engine diimpor dinamis, jadi GpuDeviceFailure dikenali dari field detail-nya.
        failDevice = (e) => {
          const detail = (e as Error & { detail?: unknown }).detail;
          reject(new GpuDeviceError(e.message, typeof detail === "string" ? detail : undefined));
        };
      });
      deviceFailure.catch(() => {});
      const guard = <T,>(p: Promise<T>) => Promise.race([p, deviceFailure]);

      during = "memuat model";
      const engine: MLCEngineInterface = await guard(
        getWebLLMEngine(
          (p) => setStatus(`Memuat model: ${Math.round((p.progress ?? 0) * 100)}% — ${p.text}`),
          failDevice,
          modelId,
        ),
      );

      await refreshPrefillChunkSize();
      const prefill = await getEffectivePrefillChunkSize();
      segmentEnvironment = { ...segmentEnvironment, prefillChunkSize: prefill };
      setEnvironment(segmentEnvironment);
      if (resume) resumed.push({ at: new Date().toISOString(), environment: segmentEnvironment });
      else runEnvironment = segmentEnvironment;
      persist();

      // Inferensi pertama memuat shader/kernel GPU; tidak ikut dihitung supaya latensi tidak bias.
      setStatus("Pemanasan model (tidak dinilai)…");
      during = "pemanasan model";
      await guard(runAgentTurn(engine, [], "halo", await createConversation("multi_agent"), businessId));

      const todo = remainingPlan(plan, collected.map(toStoredRow));
      const durations: number[] = [];
      let consecutiveServerFallbacks = 0;
      const segmentStart = performance.now();
      // Mode diselang-seling per skenario supaya kondisi perangkat (suhu, beban) setara di kedua konfigurasi.
      for (const { scenarioId, mode, repetition = 1 } of todo) {
        if (controller.signal.aborted) throw Object.assign(new Error("Dihentikan oleh pengguna."), { name: "TurnStoppedError" });
        const scenario = SCENARIOS.find((s) => s.id === scenarioId);
        if (!scenario) continue;
        // Awal ulangan 2 dst.: data eval direset supaya stok tiap ulangan mulai dari seed yang sama.
        if (repetition > 1 && !collected.some((r) => (r.observation.repetition ?? 1) === repetition)) {
          setStatus(`Ulangan ${repetition}/${totalRepetitions}: mereset data eval…`);
          const res = await fetch("/api/eval/seed", { method: "POST" });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(`Reset data eval sebelum ulangan ${repetition} gagal: ${body.error ?? `HTTP ${res.status}`}`);
          }
        }
        const execStart = performance.now();
        const done = collected.length;
        const repLabel = totalRepetitions > 1 ? ` · ulangan ${repetition}/${totalRepetitions}` : "";
        setStatus(`[${done + 1}/${plan.length}] ${scenario.id} · ${mode}${repLabel}`);
        setProgress({
          done,
          total: plan.length,
          elapsedMs: performance.now() - segmentStart,
          etaMs: estimateRemainingMs(durations, plan.length - done),
        });
        during = `${scenario.id} · ${mode}`;
        const stockBefore = await snapshotStock();
        const base: Omit<Observation, "stockAfter"> = {
          scenarioId: scenario.id,
          mode,
          ...(repetition > 1 && { repetition }),
          predictedRoute: null,
          assistantText: "",
          toolTrace: [],
          pending: false,
          confirmOutcome: "none",
          stockBefore,
          latencyMs: null,
          promptTokens: null,
          completionTokens: null,
          promptPadding: isPromptPaddingOn(),
        };
        let observation: Observation;
        setLiveSteps([]);
        const scenarioStartedAt = Date.now();
        const turnId = `${scenario.id}-${mode}-${scenarioStartedAt}`;
        const updateTurn = (patch: Partial<TurnRecord>) =>
          setEvalTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, ...patch } : t)));
        setEvalTurns((prev) => [
          ...prev.slice(-19),
          { id: turnId, title: `${scenario.id} · ${mode === "multi_agent" ? "multi" : "single"} · ${scenario.message}`, startedAt: scenarioStartedAt, snapshot: null },
        ]);
        let latestInference: InferenceSnapshot | null = null;
        // Maksimal 2 render per detik supaya tampilan statistik tidak menambah beban
        // selama skenario diukur (sebelumnya halaman ini tidak render per token).
        let lastInferenceRender = 0;
        let lastCallCount = 0;
        const onInference = (snapshot: InferenceSnapshot) => {
          latestInference = snapshot;
          const now = Date.now();
          if (now - lastInferenceRender < 500 && snapshot.calls.length === lastCallCount && snapshot.calls.at(-1)?.status === "running") return;
          lastInferenceRender = now;
          lastCallCount = snapshot.calls.length;
          updateTurn({ snapshot });
        };
        try {
          const conversationId = await createConversation(mode);
          const result = await guard(
            runAgentTurn(engine, [], scenario.message, conversationId, businessId, undefined, {
              mode,
              getDevicePosition: fixedDevicePosition,
              onStep: setLiveSteps,
              onInference,
              signal: controller.signal,
            }),
          );
          let confirm: { outcome: ConfirmOutcome; error?: string } = { outcome: "none" };
          if (result.pendingConfirmation) {
            confirm = await resolvePending(
              result.pendingConfirmation.tool_name,
              result.pendingConfirmation.audit_log_id,
              scenario,
            );
          }
          observation = {
            ...base,
            predictedRoute: result.agentType,
            routerPredictedRoute: result.routerAgentType ?? null,
            ...(result.routedByCode && { routedByCode: true }),
            assistantText: result.assistantText,
            modelReplies: result.modelReplies,
            processSteps: result.processSteps,
            ...(result.inferenceStats && { modelCalls: result.inferenceStats.calls }),
            toolTrace: result.toolTrace,
            ...(hasServerFallback(result.toolTrace) && { serverFallback: true }),
            pending: Boolean(result.pendingConfirmation),
            // Runner tidak memilihkan lokasi: pilihan staf di luar cakupan satu skenario.
            locationPrompt:
              result.choice?.kind === "location"
                ? {
                    suggestedLocationId: result.choice.suggestedLocationId,
                    suggestionReason: result.choice.suggestionReason,
                  }
                : undefined,
            productPrompt:
              result.choice?.kind === "product"
                ? { candidateIds: result.choice.options.map((o) => o.id) }
                : undefined,
            confirmOutcome: confirm.outcome,
            confirmError: confirm.error,
            latencyMs: result.latencyMs ?? null,
            promptTokens: result.usage?.promptTokens ?? null,
            completionTokens: result.usage?.completionTokens ?? null,
            stockAfter: await snapshotStock(),
          };
        } catch (err) {
          if (err instanceof GpuDeviceError || isStopped(err)) throw err;
          observation = {
            ...base,
            runError: err instanceof Error ? err.message : String(err),
            stockAfter: await snapshotStock(),
          };
        }
        collected.push(scoreScenario(scenario, observation, refs));
        setRows([...collected]);
        updateTurn({ snapshot: latestInference, totalMs: Date.now() - scenarioStartedAt });
        durations.push(performance.now() - execStart);
        persist();
        // Server gagal berulang: lanjut hanya membuang jam, karena jawaban stok datang dari cache lama.
        consecutiveServerFallbacks = observation.serverFallback ? consecutiveServerFallbacks + 1 : 0;
        if (consecutiveServerFallbacks >= MAX_CONSECUTIVE_SERVER_FALLBACKS) {
          throw new Error(
            `Run dihentikan: ${consecutiveServerFallbacks} eksekusi berturut-turut memakai cache perangkat atau gagal mencari produk ke server (terakhir ${scenario.id} · ${mode}). Periksa server lalu lanjutkan run dari run tersimpan.`,
          );
        }
      }
      setProgress({
        done: collected.length,
        total: plan.length,
        elapsedMs: performance.now() - segmentStart,
        etaMs: 0,
      });
      setStatus(`Selesai: ${collected.length} eksekusi. JSON & CSV diunduh otomatis.`);
      if (alertsOn) {
        const ok = collected.filter((r) => r.success).length;
        alertUser("done", "Evaluasi selesai", `${collected.length} eksekusi, ${ok} berhasil. JSON & CSV sudah diunduh.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stoppedByUser = isStopped(err);
      stop = {
        kind: err instanceof GpuDeviceError ? "gpu" : stoppedByUser ? "stopped" : "error",
        message,
        detail: err instanceof GpuDeviceError ? err.detail : undefined,
        during,
        at: new Date().toISOString(),
      };
      setStoppedReason(stop);
      const canAutoResume = err instanceof GpuDeviceError && autoResume && autoResumeCount.current < AUTO_RESUME_MAX;
      if (canAutoResume) {
        autoResumeCount.current += 1;
        const attempt = autoResumeCount.current;
        const autoResumeAt = Date.now() + AUTO_RESUME_DELAY_MS;
        setErrorModal({ kind: "gpu", message, during, at: stop.at, autoResumeAt, attempt });
        autoResumeTimer.current = setTimeout(() => {
          autoResumeTimer.current = null;
          const saved = loadSavedRun();
          if (saved) {
            setErrorModal(null);
            void run(saved, { auto: true });
          }
        }, AUTO_RESUME_DELAY_MS);
      } else if (stop.kind !== "stopped") {
        setErrorModal({ kind: stop.kind, message, during, at: stop.at });
      }
      interruptions.push(stop);
      setInterruptions([...interruptions]);
      persist();
      if (stoppedByUser) {
        setStatus('Dihentikan. Eksekusi yang sedang jalan tidak dihitung; hasil sebelumnya tersimpan, klik "Lanjutkan run" untuk meneruskan.');
      } else if (err instanceof GpuDeviceError) {
        resetEngine?.();
        setStatus(
          `Berhenti karena error GPU: ${message} Penyebab umum: Windows me-reset GPU karena satu tugas terlalu lama (TDR, LiveKernelEvent 141 di Event Viewer), halaman dimuat ulang saat berjalan (termasuk hot reload dev server karena ada file yang berubah), atau memori GPU tidak cukup untuk ${modelId}. Hasil sejauh ini tersimpan: muat ulang halaman lalu klik "Lanjutkan run"; kalau sering terulang, kecilkan "Potongan prefill".`,
        );
      } else {
        setStatus(`Berhenti: ${message} Hasil sejauh ini tersimpan; klik "Lanjutkan run" setelah masalahnya beres.`);
      }
      if (alertsOn && !stoppedByUser) {
        alertUser(
          "error",
          err instanceof GpuDeviceError ? "Evaluasi berhenti: error GPU" : "Evaluasi berhenti karena error",
          `${message.slice(0, 160)} — hasil yang sudah jalan tersimpan dan sudah diunduh.`,
        );
      }
    } finally {
      stopRef.current = null;
      releaseWake();
      setRunning(false);
      // Skenario yang terputus (GPU, error, dihentikan) jangan terus terhitung berjalan.
      setEvalTurns((prev) => prev.map((x) => (x.totalMs === undefined ? { ...x, totalMs: Date.now() - x.startedAt } : x)));
      if (collected.length > 0) {
        const json = buildExport({
          rows: collected,
          startedAt: runStartedAt,
          environment: runEnvironment,
          stoppedReason: stop,
          // Penghentian yang sedang terjadi sudah ada di stoppedReason.
          interruptions: stop ? interruptions.slice(0, -1) : interruptions,
          resumed,
        });
        downloadResults(json, collected, runStartedAt);
      }
      const finished = !stop && remainingPlan(plan, collected.map(toStoredRow)).length === 0;
      if (finished) {
        clearSavedRun();
        setSavedRun(null);
      } else {
        setSavedRun(loadSavedRun());
      }
      if (!autosaveOk) setWarning("Autosave gagal (penyimpanan browser penuh/diblokir); hasil tetap ada di file yang diunduh.");
    }
  }

  function exportJson() {
    download(
      `eval-${startedAt ?? "run"}.json`,
      buildExport({
        rows,
        startedAt,
        environment: savedRun?.environment ?? environment,
        stoppedReason,
        interruptions: stoppedReason ? interruptions.slice(0, -1) : interruptions,
        resumed: savedRun?.resumed ?? [],
      }),
      "application/json",
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Navigasi antar modul & keluar ada di ModuleDock (kanan atas). */}
      <div className="pr-dock flex min-h-[36px] items-center border-b border-slate-200 pb-3 text-sm">
        <span className="text-slate-600">
          Login sebagai <strong className="text-slate-900">{username}</strong> di{" "}
          <code className={isEvalTenant ? "text-emerald-700" : "text-red-700"}>{businessSlug}</code>
        </span>
      </div>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Evaluasi Agent (Bab 4)</h1>
        <p className="text-xs text-slate-500">Kode: {CODE_VERSION.commit} ({CODE_VERSION.branch})</p>
        <p className="text-sm text-slate-600">
          Menjalankan {SCENARIOS.length} skenario berlabel terhadap arsitektur multi-agent dan baseline single-agent pada
          perangkat ini.
        </p>
      </header>

      {!isEvalTenant && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Halaman ini hanya berjalan di tenant <code>{EVAL_TENANT_SLUG}</code> karena skenario transaksi yang dikonfirmasi PIN
          benar-benar mengubah stok. Klik <strong>Keluar</strong> di kanan atas, lalu login dengan kode toko{" "}
          <code>{EVAL_TENANT_SLUG}</code> dan username <code>evaluator</code>.
        </div>
      )}
      {draftCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {draftCount} skenario masih berlabel <code>draft</code>. Periksa label acuan secara manual sebelum run resmi.
        </div>
      )}
      {warning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{warning}</div>
      )}
      {isEvalTenant && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
          <button className="btn btn-secondary px-3 py-1.5" onClick={resetEvalData} disabled={running || seeding}>
            {seeding ? "Mereset…" : "Reset data eval"}
          </button>
          <span className="text-slate-600">
            {seedStatus ?? "Kembalikan stok, riwayat penjualan, percakapan, dan audit log tenant eval ke keadaan awal sebelum run baru."}
          </span>
        </div>
      )}

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Model</span>
          <select
            className="field-input w-full"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={running}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · ~{(m.vramMB / 1024).toFixed(1).replace(".", ",")} GB
                {m.id === MODEL_ID ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Konfigurasi</span>
          <select
            className="field-input w-full"
            value={modeChoice}
            onChange={(e) => setModeChoice(e.target.value as ModeChoice)}
            disabled={running}
          >
            <option value="both">Keduanya (diselang-seling)</option>
            <option value="multi_agent">Multi-agent saja</option>
            <option value="single_agent">Baseline single-agent saja</option>
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={padPrompt}
            onChange={(e) => {
              setPadPrompt(e.target.checked);
              setPromptPadding(e.target.checked);
            }}
            disabled={running}
          />
          <span>
            <span className="font-medium text-slate-700">Ablasi: samakan panjang prompt multi-agent dengan single-agent</span>
            <span className="block text-xs text-slate-500">
              Hanya memengaruhi mode multi-agent; tercatat di lingkungan run. Pakai hanya untuk run ablasi.
            </span>
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Filter ID (awalan)</span>
          <input
            className="field-input w-full"
            placeholder="mis. Q, T-0, atau T-06, T-1"
            value={idFilter}
            onChange={(e) => setIdFilter(e.target.value)}
            disabled={running}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Ulang</span>
          <select
            className="field-input w-full"
            value={repetitions}
            onChange={(e) => setRepetitions(Number(e.target.value))}
            disabled={running}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1× (run biasa)" : `${n}× (data eval direset tiap ulangan)`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={autoResume}
            onChange={(e) => setAutoResume(e.target.checked)}
          />
          <span>
            <span className="font-medium text-slate-700">Lanjut otomatis kalau GPU putus</span>
            <span className="block text-xs text-slate-500">
              Tunggu {AUTO_RESUME_DELAY_MS / 1000} detik lalu lanjutkan run, maksimal {AUTO_RESUME_MAX}× per run.
            </span>
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">PIN evaluator</span>
          <input
            className="field-input w-full"
            type="password"
            inputMode="numeric"
            placeholder={needsPin ? "Wajib untuk skenario konfirmasi" : "Tidak diperlukan"}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            disabled={running}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Potongan prefill (GPU lemah)</span>
          <select
            className="field-input w-full"
            value={prefillChunk ?? ""}
            onChange={(e) => {
              const size = e.target.value ? Number(e.target.value) : null;
              setPrefillChunk(size);
              setPrefillChunkPreference(size);
            }}
            disabled={running}
          >
            <option value="">Bawaan model</option>
            {PREFILL_CHUNK_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} token
              </option>
            ))}
          </select>
        </label>
        <p className="self-end text-xs text-slate-500 sm:col-span-1 lg:col-span-3">
          Kecilkan bila GPU di-reset Windows (DXGI_ERROR_DEVICE_HUNG) saat pemanasan. Tersimpan di perangkat ini,
          berlaku juga untuk /chat, dan dicatat di JSON hasil.
        </p>
        <GpuChoice
          probes={gpuProbes}
          recommendation={gpuRecommendation}
          value={gpuPref}
          disabled={running}
          changed={gpuPrefChanged}
          onChange={(pref) => {
            setGpuPref(pref);
            setGpuPreference(pref);
            setGpuPrefChanged(true);
          }}
        />
        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
          {gpuInfo === "loading"
            ? "Membaca info GPU…"
            : gpuInfo === null
              ? "WebGPU tidak tersedia di browser ini."
              : `GPU: ${gpuInfo.description || gpuInfo.vendor || "tidak diketahui"} · batas buffer ${gpuInfo.maxStorageBufferBindingSizeMB} MB · shader-f16 ${gpuInfo.shaderF16 ? "ada" : "tidak ada"}`}
          {gpuInfo && gpuInfo !== "loading" && !gpuInfo.shaderF16 && modelId.includes("q4f16") && (
            <span className="text-amber-700"> · Model q4f16 butuh shader-f16, pilih varian q4f32.</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={alertsOn} onChange={(e) => setAlertsOn(e.target.checked)} />
            Bunyikan suara & kirim notifikasi saat selesai atau error
          </label>
          <span className="text-xs text-slate-500">
            {notifPermission === "granted"
              ? "Notifikasi diizinkan."
              : notifPermission === "denied"
                ? "Notifikasi diblokir browser (hanya suara). Izinkan lewat ikon gembok di address bar."
                : notifPermission === "unsupported"
                  ? "Browser tidak mendukung notifikasi (hanya suara)."
                  : "Izin notifikasi akan diminta saat klik Jalankan."}
          </span>
          <button
            type="button"
            className="btn btn-secondary px-3 py-1 text-xs"
            onClick={() => {
              enableAlerts();
              alertUser("done", "Tes notifikasi evaluasi", "Kalau ini muncul dan terdengar bunyi, pemberitahuan sudah siap.");
            }}
          >
            Tes
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button
            className="btn btn-primary px-4 py-2"
            onClick={() => run()}
            disabled={running || !isEvalTenant || selected.length === 0 || (needsPin && pin.length < 6)}
          >
            {running ? "Berjalan…" : `Jalankan ${selected.length} skenario × ${modes.length} mode`}
          </button>
          {running && (
            <button className="btn btn-secondary px-4 py-2" onClick={() => stopRef.current?.abort()} title="Hentikan (Esc)">
              Hentikan
            </button>
          )}
          <button className="btn btn-secondary px-4 py-2" onClick={() => download(`eval-${startedAt ?? "run"}.csv`, toCsv(rows), "text/csv")} disabled={rows.length === 0}>
            Unduh CSV
          </button>
          <button className="btn btn-secondary px-4 py-2" onClick={exportJson} disabled={rows.length === 0 && !stoppedReason}>
            Unduh JSON
          </button>
          <span className="text-sm text-slate-600">{status}</span>
        </div>
        {savedRun && !running && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2 lg:col-span-4">
            <p>
              Ada run tersimpan: {savedRun.rows.length}/{savedRun.plan.length} eksekusi selesai (mulai{" "}
              {new Date(savedRun.startedAt).toLocaleString("id-ID")}, model {savedRun.modelId}
              {savedRun.interruptions.length > 0 && `, ${savedRun.interruptions.length}× berhenti`}). Melanjutkan memakai
              skenario & mode yang sama dan menggabungkan hasilnya ke satu JSON. Menjalankan run baru akan menimpanya.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary px-3 py-1.5"
                onClick={() => run(savedRun)}
                disabled={!isEvalTenant || (savedRunNeedsPin && pin.length < 6)}
              >
                Lanjutkan run
              </button>
              <button
                className="btn btn-secondary px-3 py-1.5"
                onClick={() => {
                  clearSavedRun();
                  setSavedRun(null);
                }}
              >
                Buang run tersimpan
              </button>
              {savedRunNeedsPin && pin.length < 6 && <span className="self-center text-xs">Isi PIN evaluator dulu.</span>}
            </div>
          </div>
        )}
      </section>

      {progress && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-bold tabular-nums text-slate-900">
                {progress.done}/{progress.total}
              </span>
              <span className="text-3xl font-semibold tabular-nums text-sky-700">
                {progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%
              </span>
            </div>
            <div className="text-right text-sm text-slate-600">
              <div>berjalan {formatDuration(progress.elapsedMs)}</div>
              {progress.etaMs !== null && progress.done < progress.total && (
                <div className="text-lg font-semibold text-slate-900">sisa ±{formatDuration(progress.etaMs)}</div>
              )}
            </div>
          </div>
          <div
            className="h-4 w-full overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div
              className="h-full rounded-full bg-sky-600 transition-all"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          {summaries.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {summaries.map((s) => (
                <div key={s.mode} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">
                    ETSR sementara · {s.mode === "multi_agent" ? "Multi-agent" : "Single-agent"}
                  </span>
                  <div>
                    <strong className="text-2xl tabular-nums text-slate-900">{pct(s.etsr.success, s.etsr.total)}</strong>{" "}
                    <span className="text-slate-600">
                      ({s.etsr.success}/{s.etsr.total})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {running && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Proses saat ini · {status}</h2>
            <InferenceStatsButton turns={evalTurns} className="shrink-0 px-3 py-1 text-xs" />
          </div>
          {evalTurns.length > 0 && <p className="break-words font-mono text-xs text-slate-700">{evalTurns.at(-1)!.title}</p>}
          {liveSteps.length === 0 ? (
            <p className="text-xs text-slate-500">Asisten sedang berpikir…</p>
          ) : (
            <ProcessTimeline steps={liveSteps} />
          )}
          {evalTurns.at(-1)?.totalMs === undefined && evalTurns.length > 0 && (
            <LiveInferenceLine snapshot={evalTurns.at(-1)!.snapshot} startedAt={evalTurns.at(-1)!.startedAt} />
          )}
          {(evalTurns.at(-1)?.snapshot?.calls.length ?? 0) > 0 && <CallTable calls={evalTurns.at(-1)!.snapshot!.calls} />}
        </section>
      )}

      {summaries.map((s) => (
        <section key={s.mode} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">
            {s.mode === "multi_agent" ? "Multi-agent (routing dua tahap)" : "Baseline single-agent"}
          </h2>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div>Macro F1 routing: <strong>{s.routing.macroF1.toFixed(3)}</strong></div>
            <div>
              Akurasi rute: <strong>{pct(s.routing.accuracy.correct, s.routing.accuracy.total)}</strong>
              {s.routing.routerAccuracy.total > 0 && (
                <> (Router saja {pct(s.routing.routerAccuracy.correct, s.routing.routerAccuracy.total)})</>
              )}
            </div>
            <div>Akurasi tool: <strong>{pct(s.toolAccuracy.correct, s.toolAccuracy.total)}</strong></div>
            <div>Akurasi parameter: <strong>{pct(s.parameterAccuracy.correct, s.parameterAccuracy.total)}</strong></div>
            <div>ETSR: <strong>{pct(s.etsr.success, s.etsr.total)}</strong> ({s.etsr.success}/{s.etsr.total})</div>
            <div>
              Keamanan: invariant sistem <strong>{s.security.invariantHeld}/{s.security.total}</strong> · model
              menolak serangan <strong>{s.security.modelResisted}/{s.security.total}</strong>
              {s.security.notAssessed > 0 && ` (${s.security.notAssessed} tidak dinilai karena error)`}
            </div>
            <div>
              Faithfulness jawaban stok: <strong>{s.faithfulness.faithful}/{s.faithfulness.assessed}</strong>
              {s.faithfulness.review > 0 && ` (${s.faithfulness.review} perlu dibaca manual)`}
            </div>
            <div>Latensi median: <strong>{ms(s.latency.all.median)}</strong> (IQR {ms(s.latency.all.iqr)})</div>
            <div>Query: {ms(s.latency.query.median)} (IQR {ms(s.latency.query.iqr)})</div>
            <div>Transaksi: {ms(s.latency.transaction.median)} (IQR {ms(s.latency.transaction.iqr)})</div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pr-4">Acuan \ Prediksi</th>
                  <th className="pr-4">query</th>
                  <th className="pr-4">transaction</th>
                  <th className="pr-4">off_topic</th>
                  <th className="pr-4">error</th>
                  <th className="pr-4">P</th>
                  <th className="pr-4">R</th>
                  <th className="pr-4">F1</th>
                </tr>
              </thead>
              <tbody>
                {(["query", "transaction", "off_topic"] as const).map((c) => (
                  <tr key={c}>
                    <td className="pr-4 font-medium">{c}</td>
                    <td className="pr-4">{s.routing.confusion[c].query}</td>
                    <td className="pr-4">{s.routing.confusion[c].transaction}</td>
                    <td className="pr-4">{s.routing.confusion[c].off_topic}</td>
                    <td className="pr-4">{s.routing.confusion[c].none}</td>
                    <td className="pr-4">{s.routing.perClass[c].precision.toFixed(2)}</td>
                    <td className="pr-4">{s.routing.perClass[c].recall.toFixed(2)}</td>
                    <td className="pr-4">{s.routing.perClass[c].f1.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Gagal per tahap:{" "}
            {Object.entries(s.failedStages).map(([k, v]) => `${k} ${v}`).join(" · ") || "tidak ada"}
          </p>
        </section>
      ))}

      {rows.length > 0 && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pr-3">ID</th>
                <th className="pr-3">Mode</th>
                <th className="pr-3">Acuan</th>
                <th className="pr-3">Prediksi</th>
                <th className="pr-3">Tool</th>
                <th className="pr-3">Konfirmasi</th>
                <th className="pr-3">Hasil</th>
                <th className="pr-3">Latensi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <Fragment key={idx}>
                <tr className="border-t border-slate-100 align-top">
                  <td className="pr-3 font-mono">{r.scenario.id}</td>
                  <td className="pr-3">{r.observation.mode === "multi_agent" ? "multi" : "single"}</td>
                  <td className="pr-3">{r.scenario.expected_route}</td>
                  <td className="pr-3">
                    {r.observation.predictedRoute ?? "–"}
                    {r.observation.routerPredictedRoute &&
                      r.observation.routerPredictedRoute !== r.observation.predictedRoute && (
                        <span className="text-slate-400"> (Router: {r.observation.routerPredictedRoute})</span>
                      )}
                  </td>
                  <td className="pr-3">{r.observation.toolTrace.map((t) => t.name).join(", ") || "–"}</td>
                  <td className="pr-3">
                    {r.observation.locationPrompt
                      ? "tanya lokasi"
                      : r.observation.productPrompt
                        ? "tanya barang"
                        : r.observation.confirmOutcome}
                  </td>
                  <td className={`pr-3 ${r.success ? "text-emerald-700" : "text-red-700"}`}>
                    {r.success ? "berhasil" : `gagal: ${r.failedStage}`}
                    {r.observation.runError && <div className="text-xs">{r.observation.runError}</div>}
                  </td>
                  <td className="pr-3">
                    {ms(r.observation.latencyMs)}
                    <button
                      type="button"
                      className="mt-1 block text-xs text-slate-500 underline hover:text-slate-700"
                      aria-expanded={openRows.has(idx)}
                      onClick={() =>
                        setOpenRows((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(idx)) next.add(idx);
                          return next;
                        })
                      }
                    >
                      {openRows.has(idx) ? "Tutup detail" : "Lihat detail"}
                    </button>
                  </td>
                </tr>
                {openRows.has(idx) && (
                  <tr className="bg-slate-50">
                    <td colSpan={8} className="p-3">
                      <EvalRowDetail row={r} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {errorModal && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="eval-error-title" className="fixed inset-0 z-50 flex items-center justify-center bg-red-700/95 p-4">
          <div className="w-full max-w-3xl space-y-5 text-center text-white">
            <p id="eval-error-title" className="text-4xl font-bold sm:text-6xl">
              {errorModal.kind === "gpu" ? "ERROR GPU" : "EVALUASI BERHENTI"}
            </p>
            <p className="text-xl sm:text-2xl">
              Saat {errorModal.during} · {new Date(errorModal.at).toLocaleTimeString("id-ID")}
              {progress && ` · ${progress.done}/${progress.total} eksekusi selesai`}
            </p>
            <p className="break-words text-sm opacity-90">{errorModal.message.slice(0, 300)}</p>
            <p className="text-base">
              Hasil sejauh ini tersimpan dan sudah diunduh.{" "}
              {errorModal.autoResumeAt
                ? null
                : errorModal.kind === "gpu"
                  ? "Muat ulang halaman, lalu klik \"Lanjutkan run\"."
                  : "Klik \"Lanjutkan run\" setelah masalahnya beres."}
            </p>
            {errorModal.autoResumeAt && (
              <p className="text-2xl font-semibold">
                Lanjut otomatis dalam <AutoResumeCountdown at={errorModal.autoResumeAt} /> (percobaan {errorModal.attempt}/{AUTO_RESUME_MAX})
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              {errorModal.autoResumeAt && (
                <button
                  className="rounded-lg bg-white px-5 py-3 text-lg font-semibold text-red-700"
                  onClick={() => {
                    cancelAutoResume();
                    setErrorModal({ ...errorModal, autoResumeAt: undefined });
                  }}
                >
                  Batalkan lanjut otomatis
                </button>
              )}
              {errorModal.kind === "gpu" && !errorModal.autoResumeAt && (
                <button className="rounded-lg bg-white px-5 py-3 text-lg font-semibold text-red-700" onClick={() => window.location.reload()}>
                  Muat ulang halaman
                </button>
              )}
              <button className="rounded-lg border-2 border-white px-5 py-3 text-lg font-semibold text-white" onClick={() => setErrorModal(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const AUTO_RESUME_MAX = 5;
const AUTO_RESUME_DELAY_MS = 30_000;

function AutoResumeCountdown({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return <>{Math.max(0, Math.ceil((at - now) / 1000))}s</>;
}

const PREFERENCE_LABEL: Record<GpuPowerPreference, string> = {
  "high-performance": "Performa tinggi",
  "low-power": "Hemat daya",
};

/** Pilihan GPU untuk laptop dua GPU, beserta rekomendasi (gpu-preference.ts). */
function GpuChoice({
  probes,
  recommendation,
  value,
  disabled,
  changed,
  onChange,
}: {
  probes: GpuProbe[] | null;
  recommendation: GpuRecommendation | null;
  value: GpuPowerPreference | null;
  disabled: boolean;
  changed: boolean;
  onChange: (pref: GpuPowerPreference | null) => void;
}) {
  if (!probes || !recommendation || recommendation.kind === "none") return null;
  const recommended = recommendation.kind === "choose" ? recommendation.preference : null;
  const describe = (pref: GpuPowerPreference) => {
    const adapter = probes.find((p) => p.preference === pref)?.adapter;
    const name = adapter ? `${gpuLabel(adapter)}${adapter.shaderF16 ? "" : " (tanpa f16)"}` : "tidak tersedia";
    return `${PREFERENCE_LABEL[pref]}: ${name}${pref === recommended ? " (disarankan)" : ""}`;
  };

  return (
    <div className="space-y-1 text-sm sm:col-span-2 lg:col-span-4">
      {recommendation.kind === "choose" ? (
        <label className="block space-y-1">
          <span className="font-medium text-slate-700">GPU</span>
          <select
            className="field-input w-full sm:w-auto"
            value={value ?? ""}
            onChange={(e) => onChange((e.target.value || null) as GpuPowerPreference | null)}
            disabled={disabled}
          >
            <option value="">Bawaan browser ({describe("high-performance")})</option>
            <option value="high-performance">{describe("high-performance")}</option>
            <option value="low-power">{describe("low-power")}</option>
          </select>
        </label>
      ) : (
        <p className="font-medium text-slate-700">GPU: {gpuLabel(recommendation.adapter)}</p>
      )}
      <p className="text-xs text-slate-500">
        {recommendation.kind === "choose" && <>Disarankan: {recommendation.reason} </>}
        {recommendation.kind === "single" && "Browser hanya melihat satu GPU di perangkat ini."}
        {recommendation.kind === "browser_ignores" &&
          "Browser memberi GPU yang sama untuk kedua pilihan (Chrome/Edge di Windows dikenal mengabaikan pilihan ini). Bila laptop punya dua GPU, pilih lewat Windows Settings > System > Display > Graphics > Microsoft Edge, lalu muat ulang halaman."}
        {changed && <span className="text-amber-700"> Muat ulang halaman agar GPU baru dipakai.</span>}
      </p>
    </div>
  );
}
