import { MODEL_OPTIONS, MODEL_TIERS, isF32Model, tierModelId, tierOfModel, type ModelTier } from "@/src/lib/agents/model-options";

const MIB = 2 ** 20;

/** Tensor terbesar model, dalam byte; null bila model tidak dikenal. */
export function modelBufferBytes(modelId: string): number | null {
  return MODEL_OPTIONS.find((m) => m.id === modelId)?.bufferBytes ?? null;
}

/** Model muat bila batas buffer GPU tidak diketahui (null) atau cukup besar. */
export function modelFitsGpu(modelId: string, limitBytes: number | null): boolean {
  const need = modelBufferBytes(modelId);
  return limitBytes === null || need === null || need <= limitBytes;
}

export function formatMiB(bytes: number): string {
  return `${(bytes / MIB).toFixed(bytes % MIB === 0 ? 0 : 1).replace(".", ",")} MB`;
}

/** Tingkat terbesar (Saga, Ballad, Tanka) yang muat; null bila tidak ada satu pun. */
export function largestFittingTier(limitBytes: number | null, f32: boolean): ModelTier | null {
  return MODEL_TIERS.find((t) => modelFitsGpu(tierModelId(t, f32), limitBytes)) ?? null;
}

export interface GpuCompatibility {
  /** Model yang sebaiknya dipakai; sama dengan `wanted` bila sudah muat. */
  modelId: string | null;
  /** True bila `wanted` tidak muat dan diganti (atau tidak ada pengganti). */
  changed: boolean;
  /** Kalimat untuk staf; null bila tidak ada yang perlu disampaikan. */
  message: string | null;
}

/**
 * Cocokkan model pilihan dengan batas buffer GPU (maxStorageBufferBindingSize).
 * Bila tidak muat, pilih tingkat terbesar yang muat dengan varian f16/f32 yang sama.
 */
export function checkGpuCompatibility(wanted: string, limitBytes: number | null): GpuCompatibility {
  if (modelFitsGpu(wanted, limitBytes)) return { modelId: wanted, changed: false, message: null };
  const need = modelBufferBytes(wanted) as number;
  const limit = limitBytes as number;
  const name = tierOfModel(wanted)?.name ?? wanted;
  const base = `Buffer GPU perangkat ini ${formatMiB(limit)}, sedangkan ${name} butuh ${formatMiB(need)}.`;
  const tier = largestFittingTier(limit, isF32Model(wanted));
  if (!tier) {
    return { modelId: null, changed: true, message: `${base} Tidak ada model yang muat di GPU ini.` };
  }
  return { modelId: tierModelId(tier, isF32Model(wanted)), changed: true, message: `${base} Dialihkan ke ${tier.name}.` };
}
