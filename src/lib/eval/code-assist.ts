import type { Observation } from "@/src/lib/eval/types";

/**
 * Seberapa besar kode menolong model pada satu eksekusi. Dicatat agent lewat `assist` di langkah
 * proses (process-trace.ts); validasi bawaan (cari produk, tanya lokasi, PIN) tidak dihitung
 * karena itu bagian rancangan, bukan koreksi atas kesalahan model.
 * Run lama (sebelum penanda ada) hanya terbaca bantuan rutenya, dari Router vs rute akhir.
 */
export interface CodeAssist {
  route: boolean;
  tool: boolean;
  retry: boolean;
  answer: boolean;
  any: boolean;
}

export function codeAssistOf(o: Observation): CodeAssist {
  const marks = new Set((o.processSteps ?? []).map((s) => s.assist).filter(Boolean));
  const route =
    marks.has("route") || o.routedByCode === true || (!!o.routerPredictedRoute && o.routerPredictedRoute !== o.predictedRoute);
  const tool = marks.has("tool");
  const retry = marks.has("retry");
  const answer = marks.has("answer");
  return { route, tool, retry, answer, any: route || tool || retry || answer };
}

export function codeAssistLabels(a: CodeAssist): string[] {
  return [a.route && "rute", a.tool && "alat", a.retry && "ulang", a.answer && "jawaban"].filter((x): x is string => !!x);
}
