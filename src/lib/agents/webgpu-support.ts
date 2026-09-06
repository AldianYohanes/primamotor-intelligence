/**
 * Sengaja file terpisah dari webllm-engine.ts. webllm-engine.ts meng-import
 * `@mlc-ai/web-llm` (library besar) di top-level, jadi mengimpor APA PUN
 * dari file itu — walau cuma fungsi kecil ini — bikin bundler ikut
 * menyertakan seluruh runtime web-llm ke chunk yang sama. Dengan taruh cek
 * ini di file sendiri, `ChatWindow` bisa cek dukungan WebGPU sesegera
 * mungkin saat mount TANPA menunggu/menyertakan parsing web-llm — engine
 * beneran baru di-load lewat dynamic import() setelah cek ini lolos.
 */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
