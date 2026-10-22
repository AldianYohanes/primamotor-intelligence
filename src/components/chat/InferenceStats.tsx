"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  formatDuration,
  formatRate,
  inferenceTotals,
  liveTokPerS,
  type InferenceSnapshot,
  type ModelCallStats,
} from "@/src/lib/agents/inference-stats";
import { MODEL_OPTIONS } from "@/src/lib/agents/model-options";

/** Satu giliran untuk tombol/modal statistik. `startedAt` dari Date.now(). */
export interface TurnRecord {
  id: string;
  /** Pesan staf atau nama skenario. */
  title: string;
  startedAt: number;
  snapshot: InferenceSnapshot | null;
  /** Kosong selama giliran masih berjalan. */
  totalMs?: number;
}

const HISTORY_LIMIT = 20;

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

function useGpuLabel(enabled: boolean): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    readGpuLabel().then((l) => alive && setLabel(l));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return label;
}

/** Date.now() yang diperbarui tiap 250 ms selama `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function elapsedOf(turn: TurnRecord, now: number): number {
  return turn.totalMs ?? now - turn.startedAt;
}

function modelLabel(modelId: string): string {
  return MODEL_OPTIONS.find((m) => m.id === modelId)?.label ?? modelId;
}

/** "42s · Agent menulis ±37 token" di bawah indikator "lagi mikir". */
export function LiveInferenceLine({ snapshot, startedAt }: { snapshot: InferenceSnapshot | null; startedAt: number }) {
  const now = useNow(true);
  const running = snapshot?.calls.at(-1);
  return (
    <p className="px-1 text-xs text-slate-500 tabular-nums">
      {formatDuration(now - startedAt, { precise: false })}
      {running?.status === "running" &&
        ` · ${running.label} ${running.liveTokens > 0 ? `menulis ±${running.liveTokens} token` : "membaca prompt"}`}
    </p>
  );
}

/** "Selesai dalam 38s" di bawah jawaban. */
export function InferenceSummary({ totalMs }: { totalMs: number }) {
  return <p className="mt-1 px-1 text-[11px] text-slate-400 tabular-nums">Selesai dalam {formatDuration(totalMs)}</p>;
}

function CallRow({ call, index }: { call: ModelCallStats; index: number }) {
  const running = call.status === "running";
  const out = call.completionTokens ?? call.liveTokens;
  const rate = running ? liveTokPerS(call) : call.decodeTokPerS;
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-1.5 pr-2 text-slate-700">
        {index + 1}. {call.label}
        {running && <span className="ml-1 text-brand-600">berjalan</span>}
      </td>
      <td className="py-1.5 pr-2 tabular-nums">{formatDuration(call.durationMs)}</td>
      <td className="py-1.5 pr-2 tabular-nums">
        {call.promptTokens ?? "–"} → {running ? `±${out}` : out}
      </td>
      <td className="py-1.5 pr-2 tabular-nums">{formatRate(call.prefillTokPerS)}</td>
      <td className="py-1.5 pr-2 tabular-nums">{formatRate(rate)}</td>
      <td className="py-1.5 tabular-nums">
        {call.timeToFirstTokenMs === undefined ? "–" : formatDuration(call.timeToFirstTokenMs)}
      </td>
    </tr>
  );
}

function TurnDetail({ turn, now, gpu }: { turn: TurnRecord; now: number; gpu: string | null }) {
  const snapshot = turn.snapshot;
  const totals = snapshot ? inferenceTotals(snapshot) : null;
  return (
    <div className="space-y-3 text-xs text-slate-600">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Waktu" value={formatDuration(elapsedOf(turn, now), { precise: turn.totalMs !== undefined })} />
        <Stat label="Panggilan model" value={String(totals?.calls ?? 0)} />
        <Stat label="Token masuk → keluar" value={totals ? `${totals.promptTokens} → ${totals.completionTokens}` : "–"} />
        <Stat label="Rata-rata menulis" value={formatRate(totals?.decodeTokPerS)} />
      </div>
      <p>
        Model {snapshot ? modelLabel(snapshot.modelId) : "–"}
        {gpu && ` · GPU ${gpu}`}
        {totals && ` · ${formatDuration(totals.modelMs)} di model`}
      </p>
      {snapshot && snapshot.calls.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
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
      ) : (
        <p className="text-slate-400">Belum ada panggilan model di giliran ini.</p>
      )}
      <p className="text-[11px] text-slate-400">
        Waktu, token keluar, kecepatan menulis, dan kata pertama ter-update selama model menulis (tanda ±). Token masuk
        dan kecepatan baca prompt dikirim WebLLM setelah tiap panggilan selesai.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Tombol teks berisi waktu giliran terakhir (berjalan atau selesai); membuka modal
 * statistik giliran itu plus riwayat giliran sesi ini. Tidak tampil sebelum ada giliran.
 */
export function InferenceStatsButton({ turns, className }: { turns: TurnRecord[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const latest = turns.at(-1);
  const running = latest !== undefined && latest.totalMs === undefined;
  const now = useNow(running || open);
  const gpu = useGpuLabel(open);

  if (!latest) return null;
  const selected = turns.find((t) => t.id === selectedId) ?? latest;
  const history = turns.slice(-HISTORY_LIMIT).reverse();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedId(null);
          setOpen(true);
        }}
        className={clsx("btn btn-secondary tabular-nums", className)}
        aria-label="Lihat statistik model"
        title="Statistik model"
      >
        {formatDuration(elapsedOf(latest, now), { precise: false })}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Statistik model</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {selected.title}
              {selected.totalMs === undefined && " · sedang berjalan"}
            </DialogDescription>
          </DialogHeader>
          <TurnDetail turn={selected} now={now} gpu={gpu} />
          {history.length > 1 && (
            <div className="space-y-1 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-700">Giliran di sesi ini</p>
              <ul className="space-y-1">
                {history.map((t) => {
                  const calls = t.snapshot?.calls.length ?? 0;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={clsx(
                          "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50",
                          t.id === selected.id && "bg-slate-100",
                        )}
                      >
                        <span className="truncate text-slate-700">{t.title}</span>
                        <span className="shrink-0 text-slate-500 tabular-nums">
                          {formatDuration(elapsedOf(t, now), { precise: false })} · {calls} panggilan
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
