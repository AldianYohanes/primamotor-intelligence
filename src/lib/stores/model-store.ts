"use client";

import { create } from "zustand";
import type { InitProgressReport, MLCEngineInterface } from "@mlc-ai/web-llm";
import { MODEL_ID } from "@/src/lib/agents/model-options";
import { isWebGPUAvailable } from "@/src/lib/agents/webgpu-support";
import {
  estimateSecondsLeft,
  phaseFromReport,
  SpeedTracker,
  type LoadPhase,
} from "@/src/lib/agents/model-progress";
import { holdWakeLock } from "@/src/lib/pwa/wake-lock";

/**
 * State model WebLLM untuk seluruh app. Sebelumnya engine dimuat di dalam
 * ChatWindow, jadi unduhan ikut berhenti begitu staf pindah halaman. Di sini
 * engine hidup di level modul: navigasi client-side Next.js tidak me-reload
 * dokumen, jadi unduhan tetap jalan sementara staf membuka dashboard/POS, dan
 * ChatWindow tinggal membaca engine yang sudah siap.
 *
 * - needs-download: model belum pernah diunduh, menunggu staf menekan tombol
 *   (unduhan bisa beberapa GB, jangan menghabiskan kuota tanpa izin)
 * - paused: sebagian shard sudah tersimpan (dibatalkan / koneksi putus)
 * - loading: mengunduh atau memuat ke GPU, detailnya di `phase`
 */
export type ModelStatus =
  | "idle"
  | "checking"
  | "unsupported"
  | "needs-download"
  | "paused"
  | "loading"
  | "ready"
  | "error";

interface ModelState {
  status: ModelStatus;
  phase: LoadPhase;
  modelId: string;
  totalBytes: number | null;
  cachedBytes: number;
  downloadedBytes: number;
  bytesPerSecond: number | null;
  secondsLeft: number | null;
  /** Progres 0..1 saat memuat bobot ke GPU. */
  loadFraction: number;
  /** Info non-fatal, mis. alasan unduhan terjeda. */
  notice: string | null;
  error: string | null;
  engine: MLCEngineInterface | null;
  prepare: () => Promise<void>;
  start: () => void;
  cancel: () => Promise<void>;
  retry: () => void;
  /** Hapus model dari penyimpanan perangkat; unduhan berikutnya mulai dari nol. */
  removeFromDevice: () => Promise<void>;
  /** Baca ulang ukuran model & bagian yang tersimpan (panel Account). */
  refreshInfo: () => Promise<void>;
  /** Ganti model aktif (mis. staf pindah ke varian tanpa f16 setelah error GPU) lalu cek ulang unduhan. */
  setModelId: (modelId: string) => Promise<void>;
}

const loadEngineModule = () => import("@/src/lib/agents/webllm-engine");

const speed = new SpeedTracker();
// Dinaikkan setiap mulai/batal supaya callback dari percobaan lama diabaikan.
let attempt = 0;
let resettingSelf = false;
let listenersInstalled = false;
let pausedByNetwork = false;
let releaseWakeHold: (() => void) | null = null;

function acquireWakeLock() {
  // Layar yang mati di tengah unduhan/muat membuat browser menjeda tab.
  if (!releaseWakeHold) releaseWakeHold = holdWakeLock();
}

function releaseWakeLock() {
  releaseWakeHold?.();
  releaseWakeHold = null;
}

function notifyReadyIfHidden() {
  if (document.visibilityState === "visible") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  navigator.serviceWorker?.ready
    .then((registration) =>
      registration.showNotification("Asisten AI siap dipakai", {
        body: "Model selesai dimuat. Buka chat untuk mulai bertanya.",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: "model-ready",
        data: { url: "/chat" },
      }),
    )
    .catch(() => {});
}

function isNetworkError(err: unknown) {
  return !navigator.onLine || err instanceof TypeError;
}

export const useModelStore = create<ModelState>((set, get) => {
  async function refreshDownloadInfo() {
    const mod = await loadEngineModule();
    const info = await mod
      .getModelDownloadInfo(get().modelId)
      .catch(() => ({ totalBytes: null, cachedBytes: 0 }));
    set({ totalBytes: info.totalBytes ?? get().totalBytes, cachedBytes: info.cachedBytes });
    return info;
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;

    loadEngineModule().then((mod) =>
      mod.onWebLLMEngineReset(() => {
        // Engine dibuang pihak lain (mis. /eval mengganti model): cek ulang
        // saat chat dibuka lagi.
        if (resettingSelf) return;
        attempt += 1;
        releaseWakeLock();
        set({ status: "idle", engine: null, error: null, notice: null });
      }),
    );

    window.addEventListener("online", () => {
      if (pausedByNetwork && get().status === "paused") get().start();
    });
  }

  function onProgress(current: number, report: InitProgressReport) {
    if (current !== attempt) return;
    const phase = phaseFromReport(report.text, report.progress);
    if (phase === "downloading") {
      const total = get().totalBytes;
      const mb = /(\d+)MB fetched/.exec(report.text);
      const bytes = total ? report.progress * total : mb ? Number(mb[1]) * 1024 ** 2 : 0;
      speed.add(bytes, performance.now());
      const bps = speed.bytesPerSecond();
      set({
        phase,
        downloadedBytes: bytes,
        bytesPerSecond: bps,
        secondsLeft: estimateSecondsLeft(bytes, total, bps),
      });
    } else if (phase === "loading" || phase === "compiling") {
      set({ phase, loadFraction: report.progress, secondsLeft: null });
    } else {
      set({ phase });
    }
  }

  return {
    status: "idle",
    phase: "preparing",
    modelId: MODEL_ID,
    totalBytes: null,
    cachedBytes: 0,
    downloadedBytes: 0,
    bytesPerSecond: null,
    secondsLeft: null,
    loadFraction: 0,
    notice: null,
    error: null,
    engine: null,

    prepare: async () => {
      if (get().status !== "idle") return;
      if (!isWebGPUAvailable()) {
        set({ status: "unsupported" });
        return;
      }
      set({ status: "checking" });
      // `navigator.gpu` bisa ada tanpa adapter yang benar-benar bisa dipakai
      // (driver diblokir, GPU virtual). Cek di sini supaya staf tidak diminta
      // mengunduh model beberapa GB yang lalu gagal dijalankan.
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      const adapter = await gpu?.requestAdapter().catch(() => null);
      if (!adapter) {
        set({ status: "unsupported" });
        return;
      }
      installListeners();
      const info = await refreshDownloadInfo();
      if (get().status !== "checking") return;
      if (info.totalBytes && info.cachedBytes >= info.totalBytes) {
        // Sudah tersimpan lengkap: memuat dari cache tidak memakai kuota,
        // jadi langsung jalan tanpa menunggu tombol.
        get().start();
      } else {
        set({ status: info.cachedBytes > 0 ? "paused" : "needs-download" });
      }
    },

    start: () => {
      const { status } = get();
      if (status === "loading" || status === "ready") return;
      attempt += 1;
      const current = attempt;
      pausedByNetwork = false;
      speed.reset();
      installListeners();
      acquireWakeLock();
      // Minta penyimpanan permanen supaya model beberapa GB tidak dihapus
      // browser saat memori perangkat menipis.
      navigator.storage?.persist?.().catch(() => {});
      set({
        status: "loading",
        phase: "preparing",
        downloadedBytes: get().cachedBytes,
        bytesPerSecond: null,
        secondsLeft: null,
        loadFraction: 0,
        notice: null,
        error: null,
      });

      loadEngineModule()
        .then((mod) =>
          mod.getWebLLMEngine(
            (report) => onProgress(current, report),
            (err) => {
              console.error("WebLLM device error:", err);
              if (current !== attempt) return;
              attempt += 1;
              resettingSelf = true;
              mod.resetWebLLMEngine();
              resettingSelf = false;
              releaseWakeLock();
              set({ status: "error", engine: null, error: err.message });
            },
            get().modelId,
          ),
        )
        .then((engine) => {
          if (current !== attempt) return;
          releaseWakeLock();
          set({ status: "ready", engine, secondsLeft: null });
          notifyReadyIfHidden();
        })
        .catch(async (err: unknown) => {
          if (current !== attempt) return;
          if (err instanceof Error && err.name === "ModelLoadCancelledError") return;
          releaseWakeLock();
          const phase = get().phase;
          if ((phase === "downloading" || phase === "preparing") && isNetworkError(err)) {
            pausedByNetwork = true;
            const info = await refreshDownloadInfo();
            set({
              status: info.cachedBytes > 0 ? "paused" : "needs-download",
              notice: "Koneksi terputus. Unduhan otomatis dilanjutkan begitu internet kembali.",
            });
            return;
          }
          // Tidak ada fallback ke API berbayar (keputusan produk), jadi kalau
          // WebLLM gagal dimuat tampilkan error yang jelas.
          console.error("Gagal memuat model WebLLM:", err);
          set({
            status: "error",
            error:
              "Model AI gagal dimuat di perangkat ini (biasanya karena RAM/VRAM tidak cukup). Coba tutup aplikasi lain lalu muat ulang, atau pakai perangkat lain.",
          });
        });
    },

    cancel: async () => {
      if (get().status !== "loading" || get().phase === "loading" || get().phase === "compiling") {
        return;
      }
      attempt += 1;
      pausedByNetwork = false;
      releaseWakeLock();
      const mod = await loadEngineModule();
      await mod.cancelWebLLMEngineLoad();
      const info = await refreshDownloadInfo();
      set({
        status: info.cachedBytes > 0 ? "paused" : "needs-download",
        bytesPerSecond: null,
        secondsLeft: null,
        notice: null,
      });
    },

    retry: () => {
      set({ status: "idle", error: null, notice: null, engine: null });
      get().prepare();
    },

    removeFromDevice: async () => {
      attempt += 1;
      pausedByNetwork = false;
      releaseWakeLock();
      const mod = await loadEngineModule();
      await mod.deleteCachedModel(get().modelId);
      set({ status: "idle", engine: null, cachedBytes: 0, downloadedBytes: 0, notice: null, error: null });
    },

    refreshInfo: async () => {
      await refreshDownloadInfo();
    },

    setModelId: async (modelId: string) => {
      if (modelId === get().modelId) return;
      attempt += 1;
      pausedByNetwork = false;
      releaseWakeLock();
      resettingSelf = true;
      const mod = await loadEngineModule();
      mod.resetWebLLMEngine();
      resettingSelf = false;
      set({
        status: "idle",
        phase: "preparing",
        modelId,
        totalBytes: null,
        cachedBytes: 0,
        downloadedBytes: 0,
        bytesPerSecond: null,
        secondsLeft: null,
        loadFraction: 0,
        notice: null,
        error: null,
        engine: null,
      });
      await get().prepare();
    },
  };
});
