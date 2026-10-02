/**
 * Pilihan GPU per perangkat untuk laptop dengan dua GPU (mis. Intel UHD 620 +
 * NVIDIA MX150). web-llm selalu meminta adapter "high-performance"; preferensi
 * ini dipasang lewat patch requestAdapter di webllm-engine.ts.
 *
 * Chrome/Edge di Windows dilaporkan mengabaikan powerPreference, jadi probeGpus()
 * memeriksa apakah kedua pilihan benar-benar menghasilkan GPU berbeda. Kalau
 * sama, GPU hanya bisa dipilih lewat Windows Settings > Display > Graphics.
 */
export type GpuPowerPreference = "high-performance" | "low-power";

export const GPU_PREFERENCES: readonly GpuPowerPreference[] = ["high-performance", "low-power"];

const KEY = "webllm-gpu-power-preference";

export function getGpuPreference(): GpuPowerPreference | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "high-performance" || v === "low-power" ? v : null;
  } catch {
    return null;
  }
}

export function setGpuPreference(pref: GpuPowerPreference | null) {
  try {
    if (pref) localStorage.setItem(KEY, pref);
    else localStorage.removeItem(KEY);
  } catch {
    // Penyimpanan diblokir: preferensi tidak tersimpan.
  }
}

export interface GpuAdapterSummary {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
  maxStorageBufferBindingSizeMB: number;
  maxBufferSizeMB: number;
  shaderF16: boolean;
}

export interface GpuProbe {
  preference: GpuPowerPreference;
  adapter: GpuAdapterSummary | null;
}

interface MinimalAdapter {
  info?: Record<string, string>;
  limits: { maxStorageBufferBindingSize: number; maxBufferSize: number };
  features: { has: (name: string) => boolean };
}

type RequestAdapter = (o?: { powerPreference?: string }) => Promise<MinimalAdapter | null>;

export function summarizeAdapter(adapter: MinimalAdapter): GpuAdapterSummary {
  const info = adapter.info ?? {};
  return {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
    maxStorageBufferBindingSizeMB: Math.round(adapter.limits.maxStorageBufferBindingSize / 2 ** 20),
    maxBufferSizeMB: Math.round(adapter.limits.maxBufferSize / 2 ** 20),
    shaderF16: adapter.features.has("shader-f16"),
  };
}

/**
 * Adapter yang diberikan browser untuk tiap powerPreference. Memakai
 * requestAdapter asli (sebelum patch) supaya preferensi tersimpan tidak ikut campur.
 */
export async function probeGpus(): Promise<GpuProbe[]> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: RequestAdapter } }).gpu;
  if (!gpu) return [];
  const request = (getOriginalRequestAdapter() ?? gpu.requestAdapter).bind(gpu);
  return Promise.all(
    GPU_PREFERENCES.map(async (preference) => {
      try {
        const adapter = await request({ powerPreference: preference });
        return { preference, adapter: adapter ? summarizeAdapter(adapter) : null };
      } catch {
        return { preference, adapter: null };
      }
    }),
  );
}

export function gpuLabel(a: GpuAdapterSummary): string {
  return a.description || [a.vendor, a.architecture].filter(Boolean).join(" ") || "GPU tidak dikenal";
}

function sameAdapter(a: GpuAdapterSummary, b: GpuAdapterSummary) {
  return (
    a.vendor === b.vendor &&
    a.architecture === b.architecture &&
    a.device === b.device &&
    a.description === b.description
  );
}

export type GpuRecommendation =
  | { kind: "none" }
  | { kind: "single"; adapter: GpuAdapterSummary }
  | { kind: "browser_ignores"; adapter: GpuAdapterSummary }
  | { kind: "choose"; preference: GpuPowerPreference; reason: string };

/**
 * Rekomendasi: GPU dengan shader-f16 diutamakan (model q4f16 butuh VRAM ±0,4 GB
 * lebih kecil dan lebih cepat; Run 21–23: MX150 tanpa f16 hanya muat model 1,5B
 * yang tidak layak), lalu "high-performance" sebagai penentu bila setara.
 * Besar VRAM tidak bisa dibaca lewat WebGPU, jadi tidak ikut dinilai.
 */
export function recommendGpu(probes: GpuProbe[]): GpuRecommendation {
  const found = probes.filter((p): p is GpuProbe & { adapter: GpuAdapterSummary } => p.adapter !== null);
  if (found.length === 0) return { kind: "none" };
  if (found.length === 1) return { kind: "single", adapter: found[0].adapter };
  const [a, b] = found;
  if (sameAdapter(a.adapter, b.adapter)) {
    // Satu GPU fisik, atau browser mengabaikan powerPreference (Chrome/Edge di Windows).
    return { kind: "browser_ignores", adapter: a.adapter };
  }
  const score = (p: (typeof found)[number]) =>
    (p.adapter.shaderF16 ? 2 : 0) + (p.preference === "high-performance" ? 1 : 0);
  const best = score(a) >= score(b) ? a : b;
  const other = best === a ? b : a;
  const reason =
    best.adapter.shaderF16 && !other.adapter.shaderF16
      ? `${gpuLabel(best.adapter)} mendukung shader-f16 (bisa memakai model q4f16 yang lebih hemat memori); ${gpuLabel(other.adapter)} tidak.`
      : `Keduanya setara untuk fitur yang dibutuhkan; ${gpuLabel(best.adapter)} adalah GPU berperforma lebih tinggi.`;
  return { kind: "choose", preference: best.preference, reason };
}

// --- patch requestAdapter -------------------------------------------------

let originalRequestAdapter: RequestAdapter | null = null;

function getOriginalRequestAdapter() {
  return originalRequestAdapter;
}

/**
 * Mengganti powerPreference yang diminta web-llm dengan preferensi tersimpan.
 * Berlaku untuk engine yang dibuat sesudahnya (ganti GPU = muat ulang halaman).
 */
export function installGpuPreferencePatch() {
  const Gpu = (globalThis as { GPU?: { prototype: { requestAdapter: RequestAdapter } } }).GPU;
  if (!Gpu || originalRequestAdapter) return;
  const original = Gpu.prototype.requestAdapter;
  originalRequestAdapter = original;
  Gpu.prototype.requestAdapter = function (this: unknown, options?: { powerPreference?: string }) {
    const pref = getGpuPreference();
    return original.call(this, pref ? { ...options, powerPreference: pref } : options);
  };
}
