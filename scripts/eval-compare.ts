/**
 * Bandingkan dua ekspor /eval per skenario (sebelum vs sesudah perubahan).
 *
 *   bun scripts/eval-compare.ts <sebelum.json> <sesudah.json> [--out banding.md]
 *
 * Pasangan = skenario dan mode yang sama, ulangan 1. Kelompok: skenario lama (Q, T, O),
 * H held-out, H disetel (catatan skenario diawali "DIPAKAI UNTUK PERBAIKAN"); skenario
 * keamanan tidak masuk ETSR. Hasil: jumlah berhasil, skenario pulih/turun, McNemar eksak,
 * median latensi + Wilcoxon, dan jumlah jawaban tidak setia.
 */
import fs from "node:fs";
import path from "node:path";
import scenarioFile from "../src/lib/eval/scenarios.json";
import type { StoredRow } from "../src/lib/eval/run-store";
import { mcnemarExact, wilcoxonSignedRank } from "../src/lib/eval/stats";
import type { Scenario } from "../src/lib/eval/types";
import type { AgentMode } from "../src/lib/agents/orchestrator";

const SCENARIOS = scenarioFile.scenarios as unknown as Scenario[];
const MODES: AgentMode[] = ["multi_agent", "single_agent"];
const MODE_LABEL: Record<AgentMode, string> = { multi_agent: "Multi-agent", single_agent: "Single-agent" };

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && !(outIdx >= 0 && i === outIdx + 1));
if (files.length !== 2) {
  console.error("Pakai: bun scripts/eval-compare.ts <sebelum.json> <sesudah.json> [--out banding.md]");
  process.exit(1);
}

interface RunFile {
  scenarioVersion?: string;
  environment?: { model?: string; gitCommit?: string; gitBranch?: string } | null;
  rows: StoredRow[];
}
const [before, after] = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as RunFile);

const byKey = (run: RunFile) =>
  new Map(
    run.rows
      .filter((r) => (r.observation.repetition ?? 1) === 1)
      .map((r) => [`${r.scenario}|${r.observation.mode}`, r] as const),
  );
const A = byKey(before);
const B = byKey(after);

type Group = "lama" | "heldout" | "disetel";
const GROUP_LABEL: Record<Group, string> = { lama: "Skenario lama (Q, T, O)", heldout: "H held-out", disetel: "H disetel" };
const scenarioById = new Map(SCENARIOS.map((s) => [s.id, s]));
function groupOf(id: string): Group | null {
  const s = scenarioById.get(id);
  if (!s || s.variant === "keamanan") return null;
  if (!id.startsWith("H-")) return "lama";
  return /^DIPAKAI UNTUK PERBAIKAN/i.test(s.notes ?? "") ? "disetel" : "heldout";
}

const fmtP = (p: number) => (p < 0.001 ? "< 0,001" : p.toLocaleString("id-ID", { maximumFractionDigits: 3 }));
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sec = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} s`);

const md: string[] = [];
const describe = (label: string, f: string, run: RunFile) => {
  const env = run.environment ?? {};
  const code = env.gitCommit ? ` · kode ${env.gitCommit}${env.gitBranch ? ` (${env.gitBranch})` : ""}` : "";
  return `- ${label}: \`${path.basename(f)}\` · ${env.model ?? "model ?"} · skenario ${run.scenarioVersion ?? "?"}${code}`;
};
md.push("# Perbandingan dua run /eval", "", describe("Sebelum", files[0], before), describe("Sesudah", files[1], after), "");
if (before.scenarioVersion !== after.scenarioVersion) {
  md.push(`> Versi skenario berbeda. Skenario yang isinya berubah (mis. H-16 di versi 2026-10-19) tidak sebanding.`, "");
}

for (const mode of MODES) {
  const keys = [...A.keys()].filter((k) => k.endsWith(`|${mode}`) && B.has(k) && groupOf(k.split("|")[0]) !== null);
  if (!keys.length) continue;
  md.push(`## ${MODE_LABEL[mode]} (${keys.length} pasangan)`, "");
  md.push("| Kelompok | n | Sebelum | Sesudah | Pulih | Turun | McNemar p |", "|---|---|---|---|---|---|---|");
  const rowsFor = (g: Group | "semua") =>
    keys.filter((k) => g === "semua" || groupOf(k.split("|")[0]) === g).map((k) => ({ id: k.split("|")[0], a: A.get(k)!, b: B.get(k)! }));
  for (const g of [...(Object.keys(GROUP_LABEL) as Group[]), "semua" as const]) {
    const rs = rowsFor(g);
    if (!rs.length) continue;
    const t = mcnemarExact(rs.map((r) => ({ a: r.b.success, b: r.a.success })));
    const gained = rs.filter((r) => !r.a.success && r.b.success).map((r) => r.id);
    const lost = rs.filter((r) => r.a.success && !r.b.success).map((r) => `${r.id} (${r.b.failedStage ?? "?"})`);
    md.push(
      `| ${g === "semua" ? "**Gabungan**" : GROUP_LABEL[g]} | ${rs.length} | ${rs.filter((r) => r.a.success).length} | ${rs.filter((r) => r.b.success).length} | ${gained.join(", ") || "–"} | ${lost.join(", ") || "–"} | ${fmtP(t.p)} |`,
    );
  }
  const all = rowsFor("semua");
  const lat = all.filter((r) => r.a.observation.latencyMs != null && r.b.observation.latencyMs != null);
  const w = wilcoxonSignedRank(lat.map((r) => ({ a: r.b.observation.latencyMs as number, b: r.a.observation.latencyMs as number })));
  const unfaithful = (side: "a" | "b") => all.filter((r) => r[side].faithfulness === "unfaithful").length;
  md.push(
    "",
    `- Median latensi: ${sec(median(lat.map((r) => r.a.observation.latencyMs as number)))} → ${sec(median(lat.map((r) => r.b.observation.latencyMs as number)))} (Wilcoxon p ${fmtP(w.p)}, n = ${w.n}).`,
    `- Jawaban tidak setia (faithfulness): ${unfaithful("a")} → ${unfaithful("b")}.`,
    "",
  );
}
md.push("Cara baca: McNemar hanya memakai pasangan yang hasilnya berubah; dengan sedikit pasangan berubah, p besar tidak membuktikan tidak ada efek.");

const text = md.join("\n") + "\n";
if (outFile) {
  fs.writeFileSync(outFile, text);
  console.log(`Perbandingan ditulis ke ${outFile}`);
} else {
  process.stdout.write(text);
}
