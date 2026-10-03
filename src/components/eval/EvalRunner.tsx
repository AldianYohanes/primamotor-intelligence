"use client";

import { useEffect, useMemo, useState } from "react";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { createClient } from "@/src/lib/supabase/client";
import { isWebGPUAvailable } from "@/src/lib/agents/webgpu-support";
import { MODEL_ID, MODEL_OPTIONS } from "@/src/lib/agents/model-options";
import type { AgentMode, ProcessStep } from "@/src/lib/agents/orchestrator";
import { ProcessTimeline } from "@/src/components/chat/ProcessDetails";
import scenarioFile from "@/src/lib/eval/scenarios.json";
import { scoreScenario, stockKey, summarize, toCsv, type ModeSummary } from "@/src/lib/eval/scoring";
import { alertUser, notificationPermission, primeAlerts } from "@/src/lib/eval/alerts";
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
async function readGpuInfo(): Promise<GpuInfo | null> {
  const probes = await probeGpus();
  const pref = getGpuPreference() ?? "high-performance";
  return probes.find((p) => p.preference === pref)?.adapter ?? null;
}

async function collectEnvironment(modelId: string) {
  return {
    model: modelId,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    gpu: await readGpuInfo(),
    /** null = bawaan web-llm (high-performance); lihat gpu-preference.ts. */
    gpuPreference: getGpuPreference(),
    /** Diisi setelah model dimuat; lihat prefill-preference.ts. */
    prefillChunkSize: null as { effective: number | null; modelDefault: number | null } | null,
  };
}

export function EvalRunner({ businessId, businessSlug, staffId, username }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [modeChoice, setModeChoice] = useState<ModeChoice>("both");
  const [idFilter, setIdFilter] = useState("");
  const [pin, setPin] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Belum dijalankan.");
  const [warning, setWarning] = useState<string | null>(null);
  const [rows, setRows] = useState<ScoredRow[]>([]);
  const [environment, setEnvironment] = useState<Awaited<ReturnType<typeof collectEnvironment>> | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  // Ikut diekspor supaya run yang berhenti di tengah bisa ditelusuri dari JSON saja.
  const [stoppedReason, setStoppedReason] = useState<{
    kind: "gpu" | "error";
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
  const [prefillChunk, setPrefillChunk] = useState<number | null>(null);
  const [gpuProbes, setGpuProbes] = useState<GpuProbe[] | null>(null);
  const [gpuPref, setGpuPref] = useState<GpuPowerPreference | null>(null);
  // Ganti GPU baru berlaku untuk engine baru; engine yang sudah dimuat tetap di GPU lama.
  const [gpuPrefChanged, setGpuPrefChanged] = useState(false);

  useEffect(() => {
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
      throw new Error(`Seed eval belum lengkap (produk hilang: ${missing.join(", ") || "-"}). Jalankan supabase/seed_eval.sql.`);
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
        ? `Tenant eval sudah punya ${count} audit log dari run sebelumnya. Hasil tetap valid (dinilai dari selisih stok), tapi skenario stok-kurang bisa berubah perilaku. Untuk run resmi, jalankan ulang supabase/seed_eval.sql dulu.`
        : null,
    );
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

  async function run() {
    if (!isEvalTenant) return;
    if (alertsOn) enableAlerts();
    let resetEngine: (() => void) | undefined;
    setRunning(true);
    setRows([]);
    setStoppedReason(null);
    let during = "persiapan";
    setStartedAt(new Date().toISOString());
    try {
      if (!isWebGPUAvailable()) throw new Error("Browser ini tidak mendukung WebGPU.");
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
      setEnvironment(await collectEnvironment(modelId));

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
      setEnvironment((env) => (env ? { ...env, prefillChunkSize: prefill } : env));

      // Inferensi pertama memuat shader/kernel GPU; tidak ikut dihitung supaya latensi tidak bias.
      setStatus("Pemanasan model (tidak dinilai)…");
      during = "pemanasan model";
      await guard(runAgentTurn(engine, [], "halo", await createConversation("multi_agent"), businessId));

      const collected: ScoredRow[] = [];
      let i = 0;
      const total = selected.length * modes.length;
      // Mode diselang-seling per skenario supaya kondisi perangkat (suhu, beban) setara di kedua konfigurasi.
      for (const scenario of selected) {
        for (const mode of modes) {
          i += 1;
          setStatus(`[${i}/${total}] ${scenario.id} · ${mode}`);
          during = `${scenario.id} · ${mode}`;
          const stockBefore = await snapshotStock();
          const base: Omit<Observation, "stockAfter"> = {
            scenarioId: scenario.id,
            mode,
            predictedRoute: null,
            assistantText: "",
            toolTrace: [],
            pending: false,
            confirmOutcome: "none",
            stockBefore,
            latencyMs: null,
            promptTokens: null,
            completionTokens: null,
          };
          let observation: Observation;
          setLiveSteps([]);
          try {
            const conversationId = await createConversation(mode);
            const result = await guard(
              runAgentTurn(engine, [], scenario.message, conversationId, businessId, undefined, {
                mode,
                getDevicePosition: fixedDevicePosition,
                onStep: setLiveSteps,
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
              assistantText: result.assistantText,
              modelReplies: result.modelReplies,
              processSteps: result.processSteps,
              toolTrace: result.toolTrace,
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
            if (err instanceof GpuDeviceError) throw err;
            observation = {
              ...base,
              runError: err instanceof Error ? err.message : String(err),
              stockAfter: await snapshotStock(),
            };
          }
          collected.push(scoreScenario(scenario, observation, refs));
          setRows([...collected]);
        }
      }
      setStatus(`Selesai: ${collected.length} eksekusi.`);
      if (alertsOn) {
        const ok = collected.filter((r) => r.success).length;
        alertUser("done", "Evaluasi selesai", `${collected.length} eksekusi, ${ok} berhasil. Buka halaman untuk unduh JSON.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStoppedReason({
        kind: err instanceof GpuDeviceError ? "gpu" : "error",
        message,
        detail: err instanceof GpuDeviceError ? err.detail : undefined,
        during,
        at: new Date().toISOString(),
      });
      if (err instanceof GpuDeviceError) {
        resetEngine?.();
        setStatus(
          `Berhenti karena error GPU: ${message} Penyebab umum: Windows me-reset GPU karena satu tugas terlalu lama (TDR, LiveKernelEvent 141 di Event Viewer), halaman dimuat ulang saat berjalan (termasuk hot reload dev server karena ada file yang berubah), atau memori GPU tidak cukup untuk ${modelId}. Muat ulang halaman lalu lanjutkan dari skenario yang terputus; kalau sering terulang, kecilkan "Potongan prefill".`,
        );
      } else {
        setStatus(`Berhenti: ${message}`);
      }
      if (alertsOn) {
        alertUser(
          "error",
          err instanceof GpuDeviceError ? "Evaluasi berhenti: error GPU" : "Evaluasi berhenti karena error",
          `${message.slice(0, 160)} — hasil yang sudah jalan tetap bisa diunduh.`,
        );
      }
    } finally {
      setRunning(false);
    }
  }

  function exportJson() {
    download(
      `eval-${startedAt ?? "run"}.json`,
      JSON.stringify(
        {
          startedAt,
          scenarioVersion: scenarioFile.version,
          draftLabels: draftCount,
          environment,
          stoppedReason,
          summaries,
          rows: rows.map((r) => ({ ...r, scenario: r.scenario.id })),
        },
        null,
        2,
      ),
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
            onClick={run}
            disabled={running || !isEvalTenant || selected.length === 0 || (needsPin && pin.length < 6)}
          >
            {running ? "Berjalan…" : `Jalankan ${selected.length} skenario × ${modes.length} mode`}
          </button>
          <button className="btn btn-secondary px-4 py-2" onClick={() => download(`eval-${startedAt ?? "run"}.csv`, toCsv(rows), "text/csv")} disabled={rows.length === 0}>
            Unduh CSV
          </button>
          <button className="btn btn-secondary px-4 py-2" onClick={exportJson} disabled={rows.length === 0 && !stoppedReason}>
            Unduh JSON
          </button>
          <span className="text-sm text-slate-600">{status}</span>
        </div>
      </section>

      {running && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Proses saat ini · {status}</h2>
          {liveSteps.length === 0 ? (
            <p className="text-xs text-slate-500">Asisten sedang berpikir…</p>
          ) : (
            <ProcessTimeline steps={liveSteps} />
          )}
        </section>
      )}

      {summaries.map((s) => (
        <section key={s.mode} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">
            {s.mode === "multi_agent" ? "Multi-agent (routing dua tahap)" : "Baseline single-agent"}
          </h2>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div>Macro F1 routing: <strong>{s.routing.macroF1.toFixed(3)}</strong></div>
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
                <tr key={idx} className="border-t border-slate-100 align-top">
                  <td className="pr-3 font-mono">{r.scenario.id}</td>
                  <td className="pr-3">{r.observation.mode === "multi_agent" ? "multi" : "single"}</td>
                  <td className="pr-3">{r.scenario.expected_route}</td>
                  <td className="pr-3">{r.observation.predictedRoute ?? "–"}</td>
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
                    {r.observation.processSteps && r.observation.processSteps.length > 0 && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                          Lihat proses ({r.observation.processSteps.length})
                        </summary>
                        <div className="mt-1.5 w-72">
                          <ProcessTimeline steps={r.observation.processSteps} />
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
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
