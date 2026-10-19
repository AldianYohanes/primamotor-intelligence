"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import {
  formatElapsed,
  formatRate,
  formatSeconds,
  inferenceTotals,
  liveTokPerS,
  type InferenceSnapshot,
  type ModelCallStats,
} from "@/src/lib/agents/inference-stats";
import { MODEL_OPTIONS } from "@/src/lib/agents/model-options";

let gpuLabelPromise: Promise<string | null> | null = null;

/** Nama GPU dari WebGPU (mis. "qualcomm adreno-7xx"); dibaca sekali per halaman. */
function readGpuLabel(): Promise<string | null> {
  gpuLabelPromise ??= (async () => {
    const gpu = (navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<{ info?: Record<string, string> } | null> };
    }).gpu;
    const adapter = await gpu?.requestAdapter().catch(() => null);
    const info = adapter?.info;
    if (!info) return null;
    return [info.vendor, info.architecture || info.device || info.description].filter(Boolean).join(" ") || null;
  })();
  return gpuLabelPromise;
}

function useGpuLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    readGpuLabel().then((l) => alive && setLabel(l));
    return () => {
      alive = false;
    };
  }, []);
  return label;
}

function modelLabel(modelId: string): string {
  return MODEL_OPTIONS.find((m) => m.id === modelId)?.label ?? modelId;
}

function CallRow({ call, index }: { call: ModelCallStats; index: number }) {
  const running = call.status === "running";
  const out = call.completionTokens ?? call.liveTokens;
  const rate = running ? liveTokPerS(call) : call.decodeTokPerS;
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-1 pr-2 text-slate-700">
        {index + 1}. {call.label}
        {running && <span className="ml-1 text-brand-600">berjalan</span>}
      </td>
      <td className="py-1 pr-2 tabular-nums">{formatSeconds(call.durationMs)}</td>
      <td className="py-1 pr-2 tabular-nums">
        {call.promptTokens ?? "–"} → {running ? `±${out}` : out}
      </td>
      <td className="py-1 pr-2 tabular-nums">{formatRate(call.prefillTokPerS)}</td>
      <td className="py-1 pr-2 tabular-nums">{formatRate(rate)}</td>
      <td className="py-1 tabular-nums">
        {call.timeToFirstTokenMs === undefined ? "–" : formatSeconds(call.timeToFirstTokenMs)}
      </td>
    </tr>
  );
}

function TechnicalDetails({ snapshot }: { snapshot: InferenceSnapshot }) {
  const gpu = useGpuLabel();
  const totals = inferenceTotals(snapshot);
  return (
    <details className="mt-1 text-[11px] text-slate-500">
      <summary className="cursor-pointer select-none hover:text-slate-700">Detail teknis</summary>
      <div className="mt-1.5 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2">
        <p>
          Model {modelLabel(snapshot.modelId)}
          {gpu && ` · GPU ${gpu}`}
        </p>
        <p className="tabular-nums">
          {totals.calls} panggilan model · {formatSeconds(totals.modelMs)} di model · token {totals.promptTokens} masuk,{" "}
          {totals.completionTokens} keluar · rata-rata menulis {formatRate(totals.decodeTokPerS)}
        </p>
        {snapshot.calls.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 pr-2 font-normal">Panggilan</th>
                  <th className="py-1 pr-2 font-normal">Waktu</th>
                  <th className="py-1 pr-2 font-normal">Token masuk → keluar</th>
                  <th className="py-1 pr-2 font-normal">Baca prompt</th>
                  <th className="py-1 pr-2 font-normal">Menulis</th>
                  <th className="py-1 font-normal">Kata pertama</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.calls.map((c, i) => (
                  <CallRow key={i} call={c} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-slate-400">
          Baca prompt dan menulis dalam token per detik dari WebLLM; angka bertanda ± dihitung selama teks masih keluar.
        </p>
      </div>
    </details>
  );
}

/** Stopwatch + statistik selama model bekerja. `startedAt` dari Date.now(). */
export function LiveInferenceStats({ snapshot, startedAt }: { snapshot: InferenceSnapshot | null; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const running = snapshot?.calls.at(-1);
  return (
    <div className="px-1">
      <p className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
        <Timer size={13} className="shrink-0" />
        {formatElapsed(now - startedAt)}
        {running?.status === "running" && (
          <span>
            · {running.label}
            {running.liveTokens > 0 ? ` menulis ±${running.liveTokens} token` : " membaca prompt"}
          </span>
        )}
      </p>
      {snapshot && <TechnicalDetails snapshot={snapshot} />}
    </div>
  );
}

/** Ringkasan di bawah jawaban yang sudah selesai. */
export function InferenceSummary({ snapshot, totalMs }: { snapshot: InferenceSnapshot; totalMs: number }) {
  if (snapshot.calls.length === 0) return null;
  return (
    <div className="mt-1 px-1">
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
        <Timer size={12} className="shrink-0" />
        Selesai dalam {formatSeconds(totalMs)}
      </p>
      <TechnicalDetails snapshot={snapshot} />
    </div>
  );
}
