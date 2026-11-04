/**
 * Kondisi pembanding khusus /eval, seperti prompt-padding.ts: default mati dan dicatat di ekspor.
 * Dibuat untuk menjawab dua pertanyaan penguji tanpa mengubah perilaku aplikasi:
 * - singleParity: apakah keunggulan multi-agent masih ada bila single-agent dijaga sama ketatnya
 *   (balasan di luar topik dari kode, teguran angka tanpa data, cek dua lokasi)?
 * - codeRouter: apakah Router LLM diperlukan, atau kata kunci cukup (routeByCode di route-guard.ts)?
 */
let singleParity = false;
let codeRouter = false;

export function setSingleParity(on: boolean): void {
  singleParity = on;
}

export function isSingleParityOn(): boolean {
  return singleParity;
}

export function setCodeRouter(on: boolean): void {
  codeRouter = on;
}

export function isCodeRouterOn(): boolean {
  return codeRouter;
}
