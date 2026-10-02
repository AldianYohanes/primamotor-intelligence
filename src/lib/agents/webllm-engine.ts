"use client";

import * as webllm from "@mlc-ai/web-llm";
import { MODEL_ID } from "@/src/lib/agents/model-options";
import { getPrefillChunkPreference } from "@/src/lib/agents/prefill-preference";
import { installGpuPreferencePatch } from "@/src/lib/agents/gpu-preference";

export { MODEL_ID };

let enginePromise: Promise<webllm.MLCEngineInterface> | null = null;
let engineModelId: string | null = null;

export function getActiveModelId(): string {
  return engineModelId ?? MODEL_ID;
}

/** Terapkan ulang preferensi potongan prefill (prefill-preference.ts) ke engine yang sudah dimuat. */
export async function refreshPrefillChunkSize() {
  const engine = await enginePromise?.catch(() => null);
  if (engine) applyPrefillChunkSize(engine);
}

// web-llm 0.2.84 membaca prefillChunkSize dari metadata model dan tidak
// menyediakan opsi untuk mengubahnya; potongan lebih kecil aman karena prefill
// memang diproses per potongan (getChunkedPrefillInputData).
interface PipelineLike {
  prefillChunkSize?: number;
  modelDefaultPrefillChunkSize?: number;
}

function applyPrefillChunkSize(engine: webllm.MLCEngineInterface) {
  const pipelines = (engine as unknown as { loadedModelIdToPipeline?: Map<string, PipelineLike> })
    .loadedModelIdToPipeline;
  for (const pipeline of pipelines?.values() ?? []) {
    if (typeof pipeline.prefillChunkSize !== "number") continue;
    pipeline.modelDefaultPrefillChunkSize ??= pipeline.prefillChunkSize;
    const preferred = getPrefillChunkPreference();
    pipeline.prefillChunkSize = preferred
      ? Math.min(preferred, pipeline.modelDefaultPrefillChunkSize)
      : pipeline.modelDefaultPrefillChunkSize;
  }
}

/** Ukuran potongan prefill yang sedang dipakai engine, untuk dicatat di hasil evaluasi. */
export async function getEffectivePrefillChunkSize(): Promise<{ effective: number | null; modelDefault: number | null }> {
  const engine = await enginePromise?.catch(() => null);
  const pipeline = (engine as unknown as { loadedModelIdToPipeline?: Map<string, PipelineLike> } | null)
    ?.loadedModelIdToPipeline?.values().next().value;
  return {
    effective: pipeline?.prefillChunkSize ?? null,
    modelDefault: pipeline?.modelDefaultPrefillChunkSize ?? null,
  };
}

/**
 * Dipanggil kalau GPUDevice yang sedang dipakai engine melempar error yang
 * tidak tertangkap (mis. validation error saat createBindGroup) atau device-
 * nya hilang (device lost — bisa karena driver crash, tab di-background
 * terlalu lama di beberapa browser, dsb). Tanpa listener ini, error-error
 * tsb cuma nyangkut di console browser tanpa ada cara bagi UI untuk bereaksi.
 */
export type WebLLMDeviceErrorHandler = (error: Error) => void;

/**
 * Error GPU dengan keterangan asli browser (alasan device lost / pesan validasi).
 * `message` tetap ramah untuk staf; `detail` untuk diagnosis, mis. JSON /eval.
 */
export class GpuDeviceFailure extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = "GpuDeviceFailure";
  }
}

let activeDeviceErrorHandler: WebLLMDeviceErrorHandler | null = null;

// Tipe minimal WebGPU: proyek ini tidak memasang @webgpu/types.
interface DeviceDescriptorLike {
  requiredLimits?: Record<string, number | undefined>;
  [key: string]: unknown;
}
interface GPUDeviceLike {
  addEventListener(
    type: "uncapturederror",
    listener: (event: { error?: { message?: string } }) => void,
  ): void;
  lost: Promise<{ reason?: string; message?: string }>;
}
interface GPUAdapterLike {
  limits: { maxStorageBufferBindingSize: number };
  requestDevice(descriptor?: DeviceDescriptorLike): Promise<GPUDeviceLike>;
}

let gpuPatchInstalled = false;

/**
 * Menyadap setiap device yang dibuat web-llm lewat GPUAdapter.requestDevice
 * (API publik web-llm tidak mengekspos device-nya), untuk dua hal:
 *
 * 1. Batas buffer binding. web-llm meminta 1 GB dan kalau adapter tidak mampu
 *    langsung turun ke 128 MB, walau banyak GPU terintegrasi (mis. Adreno X1)
 *    mengizinkan 256 MB. Buffer embedding model ber-vocab besar (~250 MB untuk
 *    Llama 3 8B) lalu gagal di createBindGroup. Di sini batas dinaikkan ke
 *    maksimum yang benar-benar didukung adapter.
 * 2. Error GPU (uncapturederror / device lost) tidak bisa di-try/catch dan tidak
 *    me-reject promise inferensi, jadi diteruskan ke onError supaya UI bisa bereaksi.
 */
function installGPUDevicePatch(onError: (error: Error) => void) {
  const Adapter = (globalThis as { GPUAdapter?: { prototype: GPUAdapterLike } }).GPUAdapter;
  if (!Adapter || gpuPatchInstalled) return;
  gpuPatchInstalled = true;
  const proto = Adapter.prototype;
  const original = proto.requestDevice;

  proto.requestDevice = async function (this: GPUAdapterLike, descriptor?: DeviceDescriptorLike) {
    const requested = descriptor?.requiredLimits?.maxStorageBufferBindingSize ?? 0;
    const patched: DeviceDescriptorLike | undefined = descriptor?.requiredLimits
      ? {
          ...descriptor,
          requiredLimits: {
            ...descriptor.requiredLimits,
            maxStorageBufferBindingSize: Math.max(requested, this.limits.maxStorageBufferBindingSize),
          },
        }
      : descriptor;
    const device = await original.call(this, patched);
    console.info("[webllm] GPU device dibuat", {
      requiredFeatures: patched?.requiredFeatures,
      maxStorageBufferBindingSize: patched?.requiredLimits?.maxStorageBufferBindingSize,
      shaderF16: (device as GPUDeviceLike & { features?: { has(f: string): boolean } }).features?.has("shader-f16"),
    });

    device.addEventListener("uncapturederror", (event) => {
      const message = event.error?.message ?? "Unknown WebGPU error";
      console.error("WebGPU uncaptured error:", message);
      onError(new GpuDeviceFailure(`Model AI berhenti merespons karena error GPU: ${message}`, `uncapturederror: ${message}`));
    });

    device.lost.then((info) => {
      if (info.reason === "destroyed") return;
      console.error("WebGPU device lost:", info.message);
      onError(
        new GpuDeviceFailure(
          "Koneksi ke GPU perangkat terputus. Muat ulang halaman untuk memakai asisten AI lagi.",
          `device lost (reason: ${info.reason ?? "unknown"}): ${info.message ?? ""}`.trim(),
        ),
      );
    });

    return device;
  };
}

/** Dilempar getWebLLMEngine kalau pemuatan dihentikan lewat cancelWebLLMEngineLoad(). */
export class ModelLoadCancelledError extends Error {
  constructor() {
    super("Unduhan model dibatalkan");
    this.name = "ModelLoadCancelledError";
  }
}

// Progress callback dipasang sekali saat engine dibuat, jadi diteruskan lewat
// variabel ini supaya pemanggil berikutnya (mis. store global setelah user
// pindah halaman) tetap menerima laporan dari engine yang sama.
let activeProgressHandler: ((report: webllm.InitProgressReport) => void) | null = null;
let loadingAttempt: { engine: webllm.MLCEngine; cancelled: boolean } | null = null;

// Pihak yang memegang engine (store global) perlu tahu kalau engine dibuang
// oleh pemanggil lain, mis. halaman /eval mengganti model.
const resetListeners = new Set<() => void>();

export function onWebLLMEngineReset(listener: () => void) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

export function getWebLLMEngine(
  onProgress?: (report: webllm.InitProgressReport) => void,
  onDeviceError?: WebLLMDeviceErrorHandler,
  modelId: string = MODEL_ID,
) {
  if (onDeviceError) {
    activeDeviceErrorHandler = onDeviceError;
  }
  if (onProgress) {
    activeProgressHandler = onProgress;
  }

  if (enginePromise && engineModelId !== modelId) {
    const previous = enginePromise;
    enginePromise = null;
    previous.then((engine) => engine.unload()).catch(() => {});
    resetListeners.forEach((listener) => listener());
  }

  if (!enginePromise) {
    engineModelId = modelId;
    installGPUDevicePatch((error) => activeDeviceErrorHandler?.(error));
    installGpuPreferencePatch();
    // Setara CreateMLCEngine, tapi instance-nya disimpan supaya unduhan bisa
    // dihentikan lewat unload() (web-llm meng-abort fetch yang sedang jalan).
    const engine = new webllm.MLCEngine({
      initProgressCallback: (report) => activeProgressHandler?.(report),
    });
    const attempt = { engine, cancelled: false };
    loadingAttempt = attempt;
    const promise: Promise<webllm.MLCEngineInterface> = engine
      .reload(modelId)
      .then(() => {
        // reload() tidak melempar error saat di-abort, cuma selesai diam-diam
        // dengan model kosong.
        if (attempt.cancelled) throw new ModelLoadCancelledError();
        applyPrefillChunkSize(engine);
        return engine;
      })
      .catch((err) => {
        // Reset supaya percobaan berikutnya (mis. setelah user pencet tombol
        // "coba lagi" di UI) tidak nyangkut di promise yang sudah gagal
        // selamanya.
        if (enginePromise === promise) enginePromise = null;
        if (attempt.cancelled) throw new ModelLoadCancelledError();
        throw err;
      })
      .finally(() => {
        if (loadingAttempt === attempt) loadingAttempt = null;
      });
    enginePromise = promise;
  }
  return enginePromise;
}

/**
 * Menghentikan unduhan model yang sedang berjalan. Shard yang sudah selesai
 * tetap tersimpan di Cache Storage, jadi getWebLLMEngine() berikutnya hanya
 * mengunduh sisanya.
 */
export async function cancelWebLLMEngineLoad() {
  const attempt = loadingAttempt;
  if (!attempt) return;
  attempt.cancelled = true;
  loadingAttempt = null;
  enginePromise = null;
  engineModelId = null;
  await attempt.engine.unload().catch(() => {});
}

/**
 * Reset instance engine yang sedang di-cache, dipakai UI setelah menerima
 * device error supaya tombol "coba lagi" benar-benar membuat engine baru,
 * bukan mengembalikan promise lama yang device-nya sudah rusak/hilang.
 */
export function resetWebLLMEngine() {
  enginePromise = null;
  engineModelId = null;
  activeDeviceErrorHandler = null;
  resetListeners.forEach((listener) => listener());
}

/**
 * Menghapus model beserta wasm & konfigurasinya dari Cache Storage (menu
 * Account → Perangkat), mis. untuk membebaskan ruang di HP. Engine yang sedang
 * dimuat ikut dilepas.
 */
export async function deleteCachedModel(modelId: string = MODEL_ID) {
  await cancelWebLLMEngineLoad();
  const previous = enginePromise;
  enginePromise = null;
  engineModelId = null;
  if (previous) await previous.then((engine) => engine.unload()).catch(() => {});
  await webllm.deleteModelAllInfoInCache(modelId);
  resetListeners.forEach((listener) => listener());
}

export interface ModelDownloadInfo {
  /** Total ukuran bobot model (byte), null kalau daftar shard gagal diambil. */
  totalBytes: number | null;
  /** Bagian yang sudah tersimpan di Cache Storage perangkat ini. */
  cachedBytes: number;
}

interface TensorCacheRecord {
  dataPath: string;
  nbytes: number;
}

/**
 * Ukuran unduhan model dan berapa yang sudah tersimpan, dibaca dari daftar
 * shard (tensor-cache.json) yang sama dengan yang dipakai web-llm. Cache key
 * web-llm = URL shard di cache "webllm/model".
 */
export async function getModelDownloadInfo(modelId: string = MODEL_ID): Promise<ModelDownloadInfo> {
  const record = webllm.prebuiltAppConfig.model_list.find((m) => m.model_id === modelId);
  if (!record || typeof caches === "undefined") return { totalBytes: null, cachedBytes: 0 };

  let base = record.model.endsWith("/") ? record.model : `${record.model}/`;
  if (!/.+\/resolve\/.+\//.test(base)) base += "resolve/main/";

  const cache = await caches.open("webllm/model");
  let records: TensorCacheRecord[] | null = null;
  for (const name of ["tensor-cache.json", "ndarray-cache.json"]) {
    const url = new URL(name, base).href;
    try {
      const response = (await cache.match(url)) ?? (await fetch(url));
      if (!response.ok) continue;
      records = ((await response.json()) as { records: TensorCacheRecord[] }).records;
      break;
    } catch {
      // coba nama berikutnya
    }
  }
  if (!records) return { totalBytes: null, cachedBytes: 0 };

  const cachedUrls = new Set((await cache.keys()).map((r) => r.url));
  let totalBytes = 0;
  let cachedBytes = 0;
  for (const shard of records) {
    totalBytes += shard.nbytes;
    if (cachedUrls.has(new URL(shard.dataPath, base).href)) cachedBytes += shard.nbytes;
  }
  return { totalBytes, cachedBytes };
}
