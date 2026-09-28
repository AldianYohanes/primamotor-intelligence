/**
 * Batas token per potongan prefill, disimpan per perangkat. GPU lemah (mis. Intel
 * UHD 620) di-reset Windows (TDR, DXGI_ERROR_DEVICE_HUNG) bila satu pekerjaan GPU
 * lebih dari ~2 detik; potongan lebih kecil = pekerjaan lebih pendek.
 * null = bawaan model hasil kompilasi.
 */
const KEY = "webllm-prefill-chunk-size";

export const PREFILL_CHUNK_OPTIONS = [512, 256, 128, 64, 32] as const;

export function getPrefillChunkPreference(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setPrefillChunkPreference(size: number | null) {
  try {
    if (size) localStorage.setItem(KEY, String(size));
    else localStorage.removeItem(KEY);
  } catch {
    // Penyimpanan diblokir: preferensi tidak tersimpan.
  }
}
