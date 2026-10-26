import {
  MAX_ANSWER_CHARS,
  hasRepetition,
  hasSelfTalk,
  isFallbackAnswer,
} from "@/src/lib/agents/answer-quality";
import type { Observation, Scenario } from "@/src/lib/eval/types";

/**
 * Mutu isi jawaban, terpisah dari ETSR lama: ETSR hanya menilai rute, alat, parameter, dan
 * stok akhir, jadi jawaban ngelantur tetap "berhasil". "ETSR ketat" = berhasil DAN tanpa masalah di sini.
 * Aturan teks murni (tanpa RefMap), jadi run lama bisa dihitung ulang dari berkasnya.
 * Keterbatasan: aturan barang-di-luar-hasil dan lokasi hanya menilai pola "Label: angka" dan
 * pertanyaan stok; kalimat bebas yang salah lolos dan tetap perlu dibaca manual.
 */
export interface AnswerQuality {
  ok: boolean;
  issues: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const words = (text: string): string[] => text.toLowerCase().match(/[a-z]{3,}/g) ?? [];

// Kata penghubung dan kata stok yang wajar di label "Sisa ...: 3" tanpa harus ada di hasil alat.
const NEUTRAL = new Set([
  "stok", "sisa", "total", "tersedia", "ada", "unit", "pcs", "jumlah", "lokasi", "barang", "ready", "saat", "ini",
  "masih", "baik", "saya", "sudah", "cek", "untuk", "dari", "dan", "yang", "kata", "hasil", "berikut", "kosong",
]);

interface StockRow {
  name: string;
  locations: { name: string; quantity: number }[];
}

function stockRows(o: Observation): StockRow[] {
  return o.toolTrace
    .filter((t) => t.name === "getStock")
    .flatMap((t) => {
      const results = asRecord(t.result).results;
      return Array.isArray(results) ? results.map(asRecord) : [];
    })
    .map((r) => ({
      name: String(r.name ?? ""),
      locations: (Array.isArray(r.stock_by_location) ? r.stock_by_location.map(asRecord) : []).map((l) => ({
        name: String(l.location_name ?? ""),
        quantity: Number(l.available_quantity ?? l.quantity ?? 0),
      })),
    }));
}

/** Label "Nama barang: angka" di jawaban yang kata-katanya tidak muncul di hasil alat atau pesan staf. */
function foreignLabels(text: string, rows: StockRow[], message: string): string[] {
  const allowed = new Set([
    ...NEUTRAL,
    ...words(message),
    ...rows.flatMap((r) => [...words(r.name), ...r.locations.flatMap((l) => words(l.name))]),
  ]);
  const found: string[] = [];
  for (const m of text.matchAll(/^[ \t]*(?:[-*•][ \t]*)?\**([^:\n]{2,50}?)\**[ \t]*:[ \t]*\**\d/gm)) {
    const label = m[1].trim();
    // Salah ketik nama barang ("sabi" untuk "sabuk") tidak dihitung; yang dihitung label yang tak satu kata pun dikenal.
    const content = words(label).filter((t) => !NEUTRAL.has(t));
    if (content.length > 0 && content.every((t) => !allowed.has(t))) found.push(label);
  }
  return found;
}

/** Lokasi yang disebut staf ("di toko") harus terjawab angkanya, atau dinyatakan kosong. */
function missesAskedLocation(s: Scenario, o: Observation, rows: StockRow[]): string | null {
  const asked = /\b(toko|gudang)\b/i.exec(s.message)?.[1]?.toLowerCase();
  if (!asked || rows.length === 0) return null;
  const quantities = rows.flatMap((r) => r.locations.filter((l) => l.name.toLowerCase() === asked).map((l) => l.quantity));
  if (quantities.length === 0) return null;
  const text = o.assistantText;
  const numbers = (text.match(/\d+/g) ?? []).map(Number);
  if (quantities.some((q) => numbers.includes(q))) return null;
  if (quantities.every((q) => q === 0) && /\b(kosong|habis|tidak ada|tidak tersedia|belum ada|nol)\b/i.test(text)) return null;
  return asked;
}

/** Jawaban stok memuat minimal satu angka dari hasil alat, atau menyatakan kosong bila semuanya nol. */
function mentionsAnyStock(text: string, rows: StockRow[]): boolean {
  const quantities = rows.flatMap((r) => r.locations.map((l) => l.quantity));
  if (quantities.length === 0) return true;
  const numbers = (text.match(/\d+/g) ?? []).map(Number);
  if (quantities.some((q) => numbers.includes(q))) return true;
  return quantities.every((q) => q === 0) && /\b(kosong|habis|tidak ada|tidak tersedia|belum ada|nol)\b/i.test(text);
}

export function assessAnswerQuality(s: Scenario, o: Observation): AnswerQuality | null {
  if (o.runError || !o.assistantText.trim()) return null;
  const text = o.assistantText;
  const issues: string[] = [];

  if (text.length > MAX_ANSWER_CHARS) issues.push(`terlalu panjang (${text.length} karakter)`);
  if (hasRepetition(text)) issues.push("kalimat yang sama berulang");
  if (hasSelfTalk(text)) issues.push("ngomong sendiri (\"tapi tunggu\", percakapan, atau sisa tag)");
  if (s.expected_route !== "off_topic" && isFallbackAnswer(text)) issues.push("jawaban cadangan (\"terlalu kompleks\" / \"kurang mengerti\")");

  if (s.expected_route === "query" && !s.expected_tools.includes("getSalesTrend")) {
    const rows = stockRows(o);
    if (rows.length > 0) {
      const foreign = foreignLabels(text, rows, s.message);
      if (foreign.length > 0) issues.push(`menyebut barang di luar hasil alat: ${foreign.slice(0, 2).join(", ")}`);
      if (!mentionsAnyStock(o.assistantText, rows)) issues.push("tidak menyebut angka stok dari hasil alat");
      const missed = missesAskedLocation(s, o, rows);
      if (missed) issues.push(`tidak menyebut stok ${missed} yang ditanya`);
    }
  }
  return { ok: issues.length === 0, issues };
}
