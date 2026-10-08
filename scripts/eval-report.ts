/**
 * Laporan bab 4 dari file JSON hasil /eval.
 *
 *   bun scripts/eval-report.ts <hasil.json> [hasil-lanjutan.json …] [--out <folder>]
 *
 * Metrik dihitung ulang dengan summarize() yang sama dengan halaman /eval, dari
 * nilai per baris yang sudah dinilai saat run. Beberapa file digabung (eksekusi
 * yang sama di file belakangan menang), mis. run yang dilanjutkan sesudah reset GPU.
 *
 * Keluaran (default: folder "<nama file>-report" di samping file pertama):
 *   summary.md, tables.tex, per-scenario.csv, confusion-multi_agent.svg,
 *   confusion-single_agent.svg, latency.svg (strip plot)
 */
import fs from "node:fs";
import path from "node:path";
import scenarioFile from "../src/lib/eval/scenarios.json";
import { summarize, toCsv, type ModeSummary } from "../src/lib/eval/scoring";
import { fromStoredRows, type StoredRow } from "../src/lib/eval/run-store";
import { mcnemarExact, wilcoxonSignedRank } from "../src/lib/eval/stats";
import type { Route, Scenario, ScoredRow } from "../src/lib/eval/types";
import type { AgentMode } from "../src/lib/agents/orchestrator";

const SCENARIOS = scenarioFile.scenarios as unknown as Scenario[];
const MODES: AgentMode[] = ["multi_agent", "single_agent"];
const ROUTES: Route[] = ["query", "transaction", "off_topic"];
const MODE_LABEL: Record<AgentMode, string> = { multi_agent: "Multi-agent", single_agent: "Single-agent" };
const ROUTE_LABEL: Record<Route, string> = { query: "Query", transaction: "Transaksi", off_topic: "Off-topic" };

// Palet tervalidasi (skill dataviz, validate_palette.js --mode light: semua lulus).
const COLOR: Record<AgentMode, string> = { multi_agent: "#2a78d6", single_agent: "#eb6834" };
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" };
const SURFACE = "#fcfcfb";
const SEQ = ["#cde2fb", "#9ec5f4", "#5598e7", "#256abf", "#104281"]; // biru, terang → gelap

// ---------- input ----------
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outArg = outIdx >= 0 ? args[outIdx + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && !(outIdx >= 0 && i === outIdx + 1));
if (files.length === 0) {
  console.error("Pakai: bun scripts/eval-report.ts <hasil.json> [lainnya.json …] [--out <folder>]");
  process.exit(1);
}

interface RunFile {
  startedAt?: string;
  scenarioVersion?: string;
  environment?: Record<string, unknown> | null;
  interruptions?: unknown[];
  stoppedReason?: unknown;
  rows: StoredRow[];
}

const runs = files.map((f) => ({ file: f, data: JSON.parse(fs.readFileSync(f, "utf8")) as RunFile }));
const warnings: string[] = [];
for (const r of runs) {
  if (r.data.scenarioVersion !== scenarioFile.version) {
    warnings.push(
      `${path.basename(r.file)} memakai skenario versi ${r.data.scenarioVersion}, kode sekarang ${scenarioFile.version}: kelas/varian dibaca dari label sekarang.`,
    );
  }
  if (r.data.stoppedReason) warnings.push(`${path.basename(r.file)} berhenti sebelum selesai (stoppedReason terisi).`);
}

const merged = new Map<string, StoredRow>();
for (const r of runs) for (const row of r.data.rows) merged.set(`${row.scenario}|${row.observation.mode}`, row);
const rows: ScoredRow[] = fromStoredRows([...merged.values()], SCENARIOS);
const missing = SCENARIOS.flatMap((s) => MODES.filter((m) => !merged.has(`${s.id}|${m}`)).map((m) => `${s.id}·${m}`));

const outDir =
  outArg ?? path.join(path.dirname(files[0]), `${path.basename(files[0], ".json")}-report`);
fs.mkdirSync(outDir, { recursive: true });

// ---------- metrik ----------
const summaries = new Map<AgentMode, ModeSummary>();
for (const m of MODES) {
  const r = rows.filter((x) => x.observation.mode === m);
  if (r.length) summaries.set(m, summarize(m, r));
}

const num = (x: number, d = 1) => x.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (a: number, b: number) => (b === 0 ? "–" : `${num((a / b) * 100)}%`);
const sec = (ms: number | null) => (ms === null ? "–" : `${num(ms / 1000, 0)} s`);
const pval = (p: number) => (p < 0.001 ? "< 0,001" : num(p, 3));

// ---------- uji berpasangan ----------
const functional = SCENARIOS.filter((s) => s.variant !== "keamanan");
const rowOf = (id: string, m: AgentMode) => rows.find((r) => r.scenario.id === id && r.observation.mode === m);
const paired = functional
  .map((s) => ({ s, a: rowOf(s.id, "multi_agent"), b: rowOf(s.id, "single_agent") }))
  .filter((p): p is { s: Scenario; a: ScoredRow; b: ScoredRow } => Boolean(p.a && p.b));

const etsrTest = mcnemarExact(paired.map((p) => ({ a: p.a.success, b: p.b.success })));
const routeTest = mcnemarExact(paired.map((p) => ({ a: p.a.routeCorrect, b: p.b.routeCorrect })));
const latencyPairs = (filter: (s: Scenario) => boolean) =>
  paired
    .filter((p) => filter(p.s) && p.a.observation.latencyMs !== null && p.b.observation.latencyMs !== null)
    .map((p) => ({ a: p.a.observation.latencyMs as number, b: p.b.observation.latencyMs as number }));
const latencyTests = [
  { label: "Semua", t: wilcoxonSignedRank(latencyPairs(() => true)) },
  ...ROUTES.map((route) => ({
    label: ROUTE_LABEL[route],
    t: wilcoxonSignedRank(latencyPairs((s) => s.expected_route === route)),
  })),
];

// ---------- summary.md ----------
const env = (runs[0].data.environment ?? {}) as Record<string, unknown>;
const gpu = (env.gpu ?? {}) as Record<string, unknown>;
const md: string[] = [];
md.push(`# Laporan evaluasi /eval`, "");
md.push(`- Sumber: ${files.map((f) => path.basename(f)).join(", ")}`);
md.push(`- Versi skenario: ${runs.map((r) => r.data.scenarioVersion).join(", ")} (kode sekarang ${scenarioFile.version})`);
md.push(`- Model: ${env.model ?? "–"} · GPU: ${gpu.description || gpu.architecture || "–"} · prefill: ${JSON.stringify(env.prefillChunkSize ?? null)}`);
md.push(`- Eksekusi: ${rows.length} dari ${SCENARIOS.length * MODES.length}${missing.length ? ` (belum ada: ${missing.join(", ")})` : ""}`);
const interruptions = runs.reduce((n, r) => n + (r.data.interruptions?.length ?? 0), 0);
if (interruptions) md.push(`- Run sempat berhenti ${interruptions}× lalu dilanjutkan.`);
for (const w of warnings) md.push(`- ⚠ ${w}`);
md.push("");

md.push(`## Metrik utama`, "", `| Metrik | ${MODES.map((m) => MODE_LABEL[m]).join(" | ")} |`, `|---|${MODES.map(() => "---").join("|")}|`);
const row = (label: string, f: (s: ModeSummary) => string) =>
  md.push(`| ${label} | ${MODES.map((m) => (summaries.get(m) ? f(summaries.get(m)!) : "–")).join(" | ")} |`);
row("Macro F1 routing", (s) => num(s.routing.macroF1, 3));
row("Akurasi tool", (s) => `${s.toolAccuracy.correct}/${s.toolAccuracy.total} (${pct(s.toolAccuracy.correct, s.toolAccuracy.total)})`);
row("Akurasi parameter", (s) => `${s.parameterAccuracy.correct}/${s.parameterAccuracy.total} (${pct(s.parameterAccuracy.correct, s.parameterAccuracy.total)})`);
row("ETSR", (s) => `${s.etsr.success}/${s.etsr.total} (${pct(s.etsr.success, s.etsr.total)})`);
for (const r of ROUTES) row(`ETSR ${ROUTE_LABEL[r]}`, (s) => `${s.etsr.byRoute[r].success}/${s.etsr.byRoute[r].total}`);
row("Keamanan: invariant sistem", (s) => `${s.security.invariantHeld}/${s.security.total}`);
row("Keamanan: model menolak serangan", (s) => `${s.security.modelResisted}/${s.security.total}`);
row("Faithfulness (setia/tidak/review)", (s) => `${s.faithfulness.faithful}/${s.faithfulness.unfaithful}/${s.faithfulness.review} dari ${s.faithfulness.assessed}`);
row("Latensi median (IQR)", (s) => `${sec(s.latency.all.median)} (${sec(s.latency.all.iqr)})`);
for (const r of ROUTES) row(`Latensi ${ROUTE_LABEL[r]}`, (s) => `${sec(s.latency[r].median)} (${sec(s.latency[r].iqr)})`);
row("Gagal per tahap", (s) => Object.entries(s.failedStages).map(([k, v]) => `${k} ${v}`).join(", ") || "–");
md.push("");

md.push(`## Precision / recall / F1 routing`, "", `| Kelas | ${MODES.map((m) => `${MODE_LABEL[m]} P / R / F1`).join(" | ")} |`, `|---|${MODES.map(() => "---").join("|")}|`);
for (const r of ROUTES) {
  md.push(`| ${ROUTE_LABEL[r]} | ${MODES.map((m) => {
    const c = summaries.get(m)?.routing.perClass[r];
    return c ? `${num(c.precision, 3)} / ${num(c.recall, 3)} / ${num(c.f1, 3)}` : "–";
  }).join(" | ")} |`);
}
md.push("");

md.push(`## Uji berpasangan multi vs single (skenario fungsional yang lengkap di kedua mode: ${paired.length})`, "");
md.push(`| Uji | Hasil | p (dua sisi) |`, `|---|---|---|`);
md.push(`| McNemar eksak, ETSR | multi saja berhasil ${etsrTest.b}, single saja berhasil ${etsrTest.c} | ${pval(etsrTest.p)} |`);
md.push(`| McNemar eksak, routing benar | multi saja benar ${routeTest.b}, single saja benar ${routeTest.c} | ${pval(routeTest.p)} |`);
for (const { label, t } of latencyTests) {
  md.push(`| Wilcoxon signed-rank, latensi ${label} | n = ${t.n}, median selisih multi − single ${t.medianDiff === null ? "–" : sec(t.medianDiff)}, W+ = ${num(t.wPlus, 1)}, W− = ${num(t.wMinus, 1)} | ${pval(t.p)} |`);
}
md.push("", "Cara baca: p < 0,05 berarti perbedaan kedua mode pada skenario yang sama kecil kemungkinannya terjadi kebetulan. McNemar hanya memakai pasangan yang hasilnya berbeda; dengan sedikit pasangan diskordan, uji ini lemah (p besar tidak membuktikan kedua mode setara).", "");

md.push(`## Eksekusi yang gagal`, "", `| Skenario | Mode | Tahap gagal | Jawaban (dipotong) |`, `|---|---|---|---|`);
for (const r of rows.filter((x) => !x.success)) {
  const text = (r.observation.runError ?? r.observation.assistantText).replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, 90);
  md.push(`| ${r.scenario.id} | ${MODE_LABEL[r.observation.mode]} | ${r.failedStage} | ${text} |`);
}
fs.writeFileSync(path.join(outDir, "summary.md"), md.join("\n") + "\n");

// ---------- tables.tex ----------
const tex: string[] = [];
const texEsc = (s: string) => s.replace(/[%&#_]/g, (c) => `\\${c}`);
const texTable = (caption: string, label: string, header: string[], body: string[][]) => {
  tex.push(
    "\\begin{table}[htbp]",
    "  \\centering",
    `  \\caption{${caption}}`,
    `  \\label{${label}}`,
    `  \\begin{tabular}{l${"r".repeat(header.length - 1)}}`,
    "    \\toprule",
    `    ${header.map(texEsc).join(" & ")} \\\\`,
    "    \\midrule",
    ...body.map((r) => `    ${r.map(texEsc).join(" & ")} \\\\`),
    "    \\bottomrule",
    "  \\end{tabular}",
    "\\end{table}",
    "",
  );
};
const cell = (m: AgentMode, f: (s: ModeSummary) => string) => (summaries.get(m) ? f(summaries.get(m)!) : "–");
tex.push("% Dihasilkan scripts/eval-report.ts — butuh \\usepackage{booktabs}", "");
texTable("Perbandingan metrik multi-agent dan single-agent", "tab:eval-metrik", ["Metrik", ...MODES.map((m) => MODE_LABEL[m])], [
  ["Macro F1 routing", ...MODES.map((m) => cell(m, (s) => num(s.routing.macroF1, 3)))],
  ["Akurasi tool", ...MODES.map((m) => cell(m, (s) => pct(s.toolAccuracy.correct, s.toolAccuracy.total)))],
  ["Akurasi parameter", ...MODES.map((m) => cell(m, (s) => pct(s.parameterAccuracy.correct, s.parameterAccuracy.total)))],
  ["ETSR", ...MODES.map((m) => cell(m, (s) => `${s.etsr.success}/${s.etsr.total} (${pct(s.etsr.success, s.etsr.total)})`))],
  ["Invariant keamanan", ...MODES.map((m) => cell(m, (s) => `${s.security.invariantHeld}/${s.security.total}`))],
  ["Model menolak serangan", ...MODES.map((m) => cell(m, (s) => `${s.security.modelResisted}/${s.security.total}`))],
]);
texTable("Precision, recall, dan F1 routing per kelas", "tab:eval-prf", ["Kelas", ...MODES.flatMap((m) => [`${MODE_LABEL[m]} P`, "R", "F1"])],
  ROUTES.map((r) => [ROUTE_LABEL[r], ...MODES.flatMap((m) => {
    const c = summaries.get(m)?.routing.perClass[r];
    return c ? [num(c.precision, 3), num(c.recall, 3), num(c.f1, 3)] : ["–", "–", "–"];
  })]));
texTable("Latensi end-to-end per giliran (median dan IQR, detik)", "tab:eval-latensi", ["Kelas", ...MODES.map((m) => MODE_LABEL[m])],
  [["Semua", ...MODES.map((m) => cell(m, (s) => `${sec(s.latency.all.median)} (${sec(s.latency.all.iqr)})`))],
   ...ROUTES.map((r) => [ROUTE_LABEL[r], ...MODES.map((m) => cell(m, (s) => `${sec(s.latency[r].median)} (${sec(s.latency[r].iqr)})`))])]);
texTable("Uji berpasangan multi-agent vs single-agent", "tab:eval-uji", ["Uji", "Statistik", "p"], [
  ["McNemar eksak (ETSR)", `b = ${etsrTest.b}, c = ${etsrTest.c}`, pval(etsrTest.p)],
  ["McNemar eksak (routing)", `b = ${routeTest.b}, c = ${routeTest.c}`, pval(routeTest.p)],
  ...latencyTests.map(({ label, t }) => [`Wilcoxon latensi (${label})`, `n = ${t.n}, W+ = ${num(t.wPlus, 1)}`, pval(t.p)]),
]);
fs.writeFileSync(path.join(outDir, "tables.tex"), tex.join("\n"));

// ---------- per-scenario.csv ----------
fs.writeFileSync(path.join(outDir, "per-scenario.csv"), toCsv(rows));

// ---------- SVG: confusion matrix ----------
const FONT = `font-family="Inter, 'Segoe UI', Helvetica, Arial, sans-serif"`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
for (const m of MODES) {
  const s = summaries.get(m);
  if (!s) continue;
  const cols: (Route | "none")[] = [...ROUTES, "none"];
  const colLabel = (c: Route | "none") => (c === "none" ? "Error" : ROUTE_LABEL[c]);
  const cw = 92, ch = 46, left = 112, top = 74;
  const width = left + cols.length * cw + 16, height = top + ROUTES.length * ch + 44;
  const parts: string[] = [];
  parts.push(`<rect width="${width}" height="${height}" fill="${SURFACE}"/>`);
  parts.push(`<text x="16" y="24" font-size="14" font-weight="600" fill="${INK.primary}">${MODE_LABEL[m]}: routing (n = ${s.routing.n}, Macro F1 ${num(s.routing.macroF1, 3)})</text>`);
  parts.push(`<text x="${left + (cols.length * cw) / 2}" y="${top - 30}" font-size="11" fill="${INK.secondary}" text-anchor="middle">Prediksi</text>`);
  cols.forEach((c, j) => parts.push(`<text x="${left + j * cw + cw / 2}" y="${top - 10}" font-size="11" fill="${INK.secondary}" text-anchor="middle">${colLabel(c)}</text>`));
  parts.push(`<text x="16" y="${top - 10}" font-size="11" fill="${INK.secondary}">Acuan</text>`);
  ROUTES.forEach((r, i) => {
    const rowCounts = s.routing.confusion[r];
    const total = Object.values(rowCounts).reduce((a, b) => a + b, 0);
    parts.push(`<text x="16" y="${top + i * ch + ch / 2 + 4}" font-size="12" fill="${INK.primary}">${ROUTE_LABEL[r]}</text>`);
    cols.forEach((c, j) => {
      const v = rowCounts[c];
      const share = total ? v / total : 0;
      const step = v === 0 ? -1 : Math.min(SEQ.length - 1, Math.floor(share * SEQ.length - 1e-9));
      const fill = step < 0 ? SURFACE : SEQ[step];
      const x = left + j * cw, y = top + i * ch;
      parts.push(`<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="4" fill="${fill}" stroke="${step < 0 ? INK.grid : fill}"/>`);
      parts.push(`<text x="${x + cw / 2}" y="${y + ch / 2 + 5}" font-size="14" text-anchor="middle" fill="${step >= 3 ? "#ffffff" : INK.primary}">${v}</text>`);
    });
  });
  parts.push(`<text x="16" y="${height - 14}" font-size="10" fill="${INK.muted}">Warna = porsi baris (recall); angka = jumlah eksekusi. Skenario keamanan tidak dihitung.</text>`);
  fs.writeFileSync(
    path.join(outDir, `confusion-${m}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${FONT}>\n${parts.join("\n")}\n</svg>\n`,
  );
}

// ---------- SVG: latensi (strip plot) ----------
// Strip plot, bukan boxplot: latensi per kelas sangat rapat (IQR beberapa detik)
// sehingga kotak Q1–Q3 tak terlihat; titik per eksekusi + median lebih jujur.
{
  const median = (xs: number[]) => {
    const a = [...xs].sort((p, q) => p - q);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  };
  const groups = ROUTES.map((r) => ({
    r,
    series: MODES.map((m) => ({
      m,
      xs: rows
        .filter((x) => x.observation.mode === m && x.scenario.expected_route === r && x.scenario.variant !== "keamanan")
        .map((x) => x.observation.latencyMs)
        .filter((v): v is number => v !== null)
        .map((v) => v / 1000),
    })),
  }));
  const maxS = Math.max(...groups.flatMap((g) => g.series.flatMap((s) => s.xs)), 1);
  const tickStep = maxS > 200 ? 60 : maxS > 100 ? 30 : 15;
  const axisMax = Math.ceil(maxS / tickStep) * tickStep;
  const left = 96, labelCol = 84, top = 64, rowH = 28, gap = 20, plotW = 500;
  const width = left + plotW + labelCol;
  const height = top + groups.length * (2 * rowH + gap) + 44;
  const x = (s: number) => left + (s / axisMax) * plotW;
  const parts: string[] = [`<rect width="${width}" height="${height}" fill="${SURFACE}"/>`];
  parts.push(`<text x="16" y="24" font-size="14" font-weight="600" fill="${INK.primary}">Latensi end-to-end per giliran (detik)</text>`);
  MODES.forEach((m, i) => {
    const lx = 16 + i * 130;
    parts.push(`<circle cx="${lx + 6}" cy="42" r="5" fill="${COLOR[m]}"/>`);
    parts.push(`<text x="${lx + 16}" y="46" font-size="11" fill="${INK.secondary}">${MODE_LABEL[m]}</text>`);
  });
  parts.push(`<text x="${left + plotW + 12}" y="46" font-size="11" fill="${INK.secondary}">Median</text>`);
  const plotBottom = height - 44;
  for (let t = 0; t <= axisMax; t += tickStep) {
    parts.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${plotBottom}" stroke="${INK.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${x(t)}" y="${plotBottom + 16}" font-size="10" fill="${INK.muted}" text-anchor="middle">${t}</text>`);
  }
  groups.forEach((g, gi) => {
    const gy = top + gi * (2 * rowH + gap);
    parts.push(`<text x="16" y="${gy + rowH + 4}" font-size="12" fill="${INK.primary}">${ROUTE_LABEL[g.r]}</text>`);
    g.series.forEach((s, si) => {
      if (s.xs.length === 0) return;
      const cy = gy + si * rowH + rowH / 2;
      // Jitter vertikal deterministik supaya titik yang bertumpuk tetap terlihat.
      s.xs.forEach((v, i) => {
        const jy = cy + (((i * 7) % 5) - 2) * 2;
        parts.push(`<circle cx="${x(v)}" cy="${jy}" r="4" fill="${COLOR[s.m]}" stroke="${SURFACE}" stroke-width="1.5"/>`);
      });
      const med = median(s.xs);
      parts.push(`<line x1="${x(med)}" x2="${x(med)}" y1="${cy - 10}" y2="${cy + 10}" stroke="${INK.primary}" stroke-width="2"/>`);
      parts.push(`<text x="${left + plotW + 12}" y="${cy + 4}" font-size="11" fill="${INK.secondary}">${num(med, 0)} s</text>`);
    });
  });
  parts.push(`<line x1="${left}" x2="${left + plotW}" y1="${plotBottom}" y2="${plotBottom}" stroke="${INK.axis}" stroke-width="1"/>`);
  parts.push(`<text x="16" y="${height - 8}" font-size="10" fill="${INK.muted}">Titik = satu eksekusi (n per baris = jumlah skenario kelas itu); garis hitam = median. Skenario keamanan tidak dihitung.</text>`);
  fs.writeFileSync(
    path.join(outDir, "latency.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${FONT}>\n${parts.join("\n")}\n</svg>\n`,
  );
}

console.log(`Laporan ditulis ke ${outDir}`);
for (const w of warnings) console.warn(`⚠ ${w}`);
if (missing.length) console.warn(`⚠ ${missing.length} eksekusi belum ada di file input.`);
