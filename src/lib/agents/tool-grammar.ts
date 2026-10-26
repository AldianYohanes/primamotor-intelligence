import type { ToolDefinition } from "@/src/lib/agents/tool-protocol";

/**
 * Grammar EBNF (response_format "grammar" WebLLM) yang memaksa balasan agent berupa SATU blok
 * panggilan alat yang valid: nama alat dari daftar, argumen sesuai skema (string, angka, atau
 * pilihan enum). Model kecil tidak lagi bisa menulis JSON rusak atau lupa memanggil alat.
 * Format sama dengan contoh di tool-protocol.ts, dan penutup </tool_call> dibiarkan ke stop sequence.
 */
interface SchemaProp {
  type?: string;
  enum?: readonly string[];
}

function lit(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function valueRule(prop: SchemaProp): string {
  if (prop.enum && prop.enum.length > 0) return `(${prop.enum.map((v) => lit(`"${v}"`)).join(" | ")})`;
  return prop.type === "number" ? "jnum" : "jstr";
}

function callRule(tool: ToolDefinition): string {
  const params = tool.function.parameters as { properties?: Record<string, SchemaProp>; required?: readonly string[] };
  const props = Object.entries(params.properties ?? {});
  const required = props.filter(([k]) => params.required?.includes(k));
  const optional = props.filter(([k]) => !params.required?.includes(k));
  // Wajib dulu (urutan skema), opsional menyusul; urutan kunci JSON tidak memengaruhi pembacaan.
  const parts = required.map(([k, p], i) => `${lit(`${i === 0 ? "" : ", "}"${k}": `)} ${valueRule(p)}`);
  const tail = optional.map(([k, p]) => `(${lit(`, "${k}": `)} ${valueRule(p)})?`);
  const args = [...parts, ...tail].join(" ");
  return `${lit(`{"name": "${tool.function.name}", "arguments": {`)}${args ? ` ${args}` : ""} ${lit("}}")}`;
}

export function toolCallGrammar(tools: readonly ToolDefinition[]): string {
  const calls = tools.map(callRule).join("\n  | ");
  return [
    `root ::= ${lit("<tool_call>\n")} call`,
    `call ::= ${calls}`,
    `jstr ::= ${lit('"')} [^"\\\\\\n]* ${lit('"')}`,
    "jnum ::= [0-9]+",
  ].join("\n");
}
