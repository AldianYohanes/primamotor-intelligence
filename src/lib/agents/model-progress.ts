/**
 * Helper murni (tanpa web-llm) untuk menerjemahkan laporan progres WebLLM
 * menjadi tahap, kecepatan unduh, dan perkiraan sisa waktu yang bisa dibaca
 * staf. Dipisah dari store supaya bisa dites tanpa browser.
 */

export type LoadPhase = "preparing" | "downloading" | "loading" | "compiling";

/**
 * Teks laporan web-llm 0.2.84:
 * - "Fetching param cache[i/n]: …MB fetched. …"  → mengunduh bobot model
 * - "Loading model from cache[i/n]: …MB loaded. …" → memindahkan bobot ke GPU
 * - "Finish loading on …" → selesai
 * Selain itu (tokenizer, wasm, "Start to fetch params") dianggap persiapan.
 */
export function phaseFromReport(text: string, progress: number): LoadPhase {
  if (text.startsWith("Fetching param cache")) return "downloading";
  if (text.startsWith("Loading model from cache")) {
    // Setelah semua shard dimuat, web-llm masih mengompilasi shader GPU tanpa
    // laporan progres lagi.
    return progress >= 1 ? "compiling" : "loading";
  }
  return "preparing";
}

interface Sample {
  t: number;
  bytes: number;
}

/**
 * Kecepatan unduh dari jendela bergeser. Jendela dipakai (bukan rata-rata
 * sejak awal) karena saat melanjutkan unduhan, shard yang sudah ter-cache
 * dilaporkan sekaligus di detik-detik pertama dan akan membuat kecepatan
 * terlihat jauh lebih tinggi dari aslinya.
 */
export class SpeedTracker {
  private samples: Sample[] = [];

  constructor(
    private windowMs = 10_000,
    private minSpanMs = 3_000,
  ) {}

  reset() {
    this.samples = [];
  }

  add(bytes: number, t: number) {
    this.samples.push({ t, bytes });
    const cutoff = t - this.windowMs;
    while (this.samples.length > 2 && this.samples[1].t <= cutoff) {
      this.samples.shift();
    }
  }

  /** Byte per detik, null kalau data belum cukup. */
  bytesPerSecond(): number | null {
    if (this.samples.length < 2) return null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const span = last.t - first.t;
    if (span < this.minSpanMs) return null;
    const speed = ((last.bytes - first.bytes) * 1000) / span;
    return speed > 0 ? speed : null;
  }
}

export function estimateSecondsLeft(
  downloadedBytes: number,
  totalBytes: number | null,
  bytesPerSecond: number | null,
): number | null {
  if (!totalBytes || !bytesPerSecond) return null;
  return Math.max(0, (totalBytes - downloadedBytes) / bytesPerSecond);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} GB`;
  }
  return `${Math.round(bytes / 1024 ** 2).toLocaleString("id-ID")} MB`;
}

export function formatSpeed(bytesPerSecond: number): string {
  const mb = bytesPerSecond / 1024 ** 2;
  return `${mb.toLocaleString("id-ID", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB/detik`;
}

/** Perkiraan kasar yang sengaja dibulatkan supaya angkanya tidak loncat-loncat. */
export function formatEta(seconds: number): string {
  if (seconds < 10) return "sebentar lagi";
  if (seconds < 60) return `± ${Math.ceil(seconds / 10) * 10} detik lagi`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `± ${minutes} menit lagi`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `± ${hours} jam ${rest} menit lagi` : `± ${hours} jam lagi`;
}
