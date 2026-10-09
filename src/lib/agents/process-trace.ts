import { describeStock, type ProductSearchResult } from "@/src/lib/agents/product-resolution";

/**
 * "Lihat proses" asisten: langkah terstruktur satu giliran (keputusan Router,
 * alat yang dipanggil beserta argumennya, ringkasan hasil, tindakan kode, lalu
 * jawaban). Bukan teks "thinking" mentah — Qwen2.5-3B tidak punya mode berpikir.
 *
 * Disimpan di agent_messages.trace (0036), jadi versinya sengaja ringkas: nama
 * barang dan jumlah hasil, bukan seluruh respons getStock.
 */
export interface ProcessStep {
  kind: "route" | "tool" | "action" | "retry" | "answer";
  label: string;
  /** Argumen alat atau ringkasan hasil; satu-dua baris. */
  detail?: string;
  status: "running" | "done" | "failed";
}

const MAX_DETAIL_CHARS = 240;

function clip(text: string, max = MAX_DETAIL_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** `query: "filter udara", limit: 5` — argumen alat dalam satu baris. */
export function formatArgs(args: Record<string, unknown>): string {
  return clip(
    Object.entries(args)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
      .join(", "),
  );
}

const AGENT_LABEL: Record<"query" | "transaction" | "off_topic", string> = {
  query: "Router memilih Query Agent (cek stok & penjualan)",
  transaction: "Router memilih Transaction Agent (catat perubahan stok)",
  off_topic: "Router menilai pesan di luar urusan stok",
};

export function routeStep(agentType: "query" | "transaction" | "off_topic"): ProcessStep {
  return { kind: "route", label: AGENT_LABEL[agentType], status: "done" };
}

export function toolStartStep(name: string, args: Record<string, unknown>): ProcessStep {
  const query = typeof args.query === "string" ? args.query : null;
  const product = typeof args.product === "string" ? args.product : null;
  let label = `Memanggil ${name}…`;
  if (name === "getStock" && query) label = `Mencari "${query}"…`;
  else if (name === "getSalesTrend") label = product ? `Mengambil tren penjualan "${product}"…` : "Mengambil tren penjualan…";
  else if (name === "updateStock") label = `Mencatat ${args.direction ?? "perubahan"} ${product ?? "barang"}…`;
  else if (name === "transferStock") label = `Memindahkan ${product ?? "barang"}…`;
  return { kind: "tool", label, detail: `${name}(${formatArgs(args)})`, status: "running" };
}

/** Ringkasan hasil alat baca (getStock/getSalesTrend); alat mutasi diringkas lewat mutationOutcomeStep. */
export function toolResultStep(name: string, result: unknown): ProcessStep {
  const r = (result ?? {}) as Record<string, unknown>;
  if (typeof r.error === "string") {
    return { kind: "tool", label: `${name} gagal`, detail: clip(r.error), status: "failed" };
  }

  if (name === "getStock") {
    const results = (Array.isArray(r.results) ? r.results : []) as ProductSearchResult[];
    const fromCache = r.source === "offline_cache";
    const source = fromCache ? " dari cache perangkat (server tidak terjangkau)" : "";
    if (results.length === 0) {
      return { kind: "tool", label: `getStock: tidak ada hasil${source}`, status: "done" };
    }
    const top = results
      .slice(0, 3)
      .map((p) => `${p.name} — ${describeStock(p)}`)
      .join("; ");
    return {
      kind: "tool",
      label: `getStock: ${results.length} hasil${source}`,
      detail: clip(results.length > 3 ? `${top}; …` : top),
      status: "done",
    };
  }

  if (name === "getSalesTrend" && r.status === "product_ambiguous") {
    const names = Array.isArray(r.candidates) ? r.candidates.map(String) : [];
    return {
      kind: "tool",
      label: `getSalesTrend: ${names.length} barang mirip, perlu ditanyakan ke staf`,
      detail: clip(names.join("; ")),
      status: "done",
    };
  }

  if (name === "getSalesTrend") {
    const trend = (Array.isArray(r.trend) ? r.trend : []) as { total_keluar?: number }[];
    const total = trend.reduce((sum, t) => sum + (t.total_keluar ?? 0), 0);
    const product = typeof r.product_name === "string" ? `${r.product_name}: ` : "";
    return {
      kind: "tool",
      label: `getSalesTrend: ${trend.length} bulan data`,
      detail: `${product}total keluar ${total}`,
      status: "done",
    };
  }

  return { kind: "tool", label: `${name} selesai`, status: "done" };
}

/** Status MutationOutcome.result (orchestrator.ts) → kalimat untuk staf. */
export function mutationOutcomeStep(result: Record<string, unknown>): ProcessStep {
  const status = String(result.status ?? "");
  const action = (label: string, failed = false): ProcessStep => ({
    kind: "action",
    label,
    status: failed ? "failed" : "done",
  });
  switch (status) {
    case "pending_confirmation":
      return action("Transaksi diajukan ke server, menunggu PIN staf");
    case "rejected":
      return { ...action("Server menolak transaksi", true), detail: clip(String(result.error ?? "")) };
    case "offline":
      return action("Sedang offline, transaksi tidak dikirim", true);
    case "product_missing":
      return action("Nama barang belum disebut, bertanya ke staf");
    case "product_search_failed":
      return action("Pencarian barang ke server gagal", true);
    case "product_not_found":
      return action(`Barang "${result.query ?? ""}" tidak ditemukan di data toko`, true);
    case "product_choice_required": {
      const n = Array.isArray(result.candidates) ? result.candidates.length : 0;
      return action(`Ada ${n} barang mirip, menunggu pilihan staf`);
    }
    case "quantity_missing":
      return action("Jumlah belum jelas, bertanya ke staf");
    case "quantity_invalid":
      return action(`Jumlah ${result.quantity ?? ""} tidak valid (harus lebih dari 0), bertanya ke staf`);
    case "direction_missing":
      return action("Arah masuk/keluar belum jelas, bertanya ke staf");
    case "locations_unavailable":
      return action("Daftar lokasi toko gagal dimuat", true);
    case "location_choice_required":
      return action(
        result.suggestion_reason === "nearest"
          ? "Lokasi belum disebut, menyarankan lokasi terdekat dan menunggu pilihan staf"
          : "Lokasi belum disebut, menunggu pilihan staf",
      );
    case "transfer_locations_missing":
      return action("Lokasi asal/tujuan belum lengkap, bertanya ke staf");
    default:
      return action(status ? `Status: ${status}` : "Selesai");
  }
}

export function retryStep(reason: "malformed" | "missing_call" | "unbacked_numbers"): ProcessStep {
  const label = {
    malformed: "Format pemanggilan alat rusak, model diminta menulis ulang",
    missing_call: "Model menyebut akan memanggil alat tapi belum memanggil, diingatkan",
    unbacked_numbers: "Model menjawab angka tanpa memanggil alat, diminta memanggil getStock dulu",
  }[reason];
  return { kind: "retry", label, status: "done" };
}

export function answerStep(
  source: "model" | "model_no_tool" | "code" | "unbacked" | "fallback",
): ProcessStep {
  const label = {
    model: "Jawaban ditulis model dari hasil di atas",
    model_no_tool: "Jawaban ditulis model tanpa memanggil alat",
    code: "Jawaban disusun kode (deterministik, tanpa model)",
    unbacked: "Jawaban berisi angka tanpa data dari alat, diganti jawaban kode",
    fallback: "Batas langkah tercapai, jawaban cadangan dipakai",
  }[source];
  return { kind: "answer", label, status: "done" };
}

/** Satu baris status saat asisten bekerja, mis. `Mencari "filter udara"…`. */
export function liveStatusLabel(steps: ProcessStep[]): string {
  const last = steps.at(-1);
  if (!last) return "Asisten sedang berpikir…";
  if (last.status === "running") return last.label;
  return "Menyusun jawaban…";
}

/**
 * Pengumpul langkah satu giliran. onChange menerima salinan daftar setiap kali
 * berubah (untuk tampilan live); kegagalannya tidak boleh mengganggu giliran chat.
 */
export class ProcessRecorder {
  readonly steps: ProcessStep[] = [];

  constructor(private readonly onChange?: (steps: ProcessStep[]) => void) {}

  add(step: ProcessStep): number {
    this.steps.push(step);
    this.emit();
    return this.steps.length - 1;
  }

  /** Ganti langkah "running" dengan hasil akhirnya. */
  finish(index: number, step: ProcessStep) {
    if (index < 0 || index >= this.steps.length) return;
    this.steps[index] = step;
    this.emit();
  }

  /** Langkah yang masih "running" ditandai gagal, mis. saat giliran melempar error. */
  failRunning() {
    let changed = false;
    this.steps.forEach((s, i) => {
      if (s.status === "running") {
        this.steps[i] = { ...s, status: "failed" };
        changed = true;
      }
    });
    if (changed) this.emit();
  }

  private emit() {
    if (!this.onChange) return;
    try {
      this.onChange(this.steps.map((s) => ({ ...s })));
    } catch {
      // Tampilan live bukan alasan untuk menggagalkan giliran.
    }
  }
}
