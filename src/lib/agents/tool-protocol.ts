/**
 * Tool calling berbasis prompt, tidak memakai parameter `tools` bawaan WebLLM.
 *
 * `tools` bawaan WebLLM 0.2.84 hanya menerima model Hermes 7-8B, menolak system
 * prompt kustom (CustomSystemPromptError), dan memaksa keluaran selalu berupa
 * JSON pemanggilan tool sehingga model tidak bisa menjawab dengan teks biasa.
 * Ketiganya tidak cocok untuk agent yang aturan keamanannya ada di system prompt.
 *
 * Format <tool_call>/<tool_response> dipilih karena dipakai saat pelatihan model
 * Hermes dan Qwen2.5, dan cukup mudah diikuti model instruct lain.
 */

export interface ToolDefinition {
  type: "function";
  function: { name: string; description?: string; parameters: unknown };
}

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ParsedReply {
  /** Teks di luar blok tool call, untuk ditampilkan ke staf. */
  text: string;
  calls: ParsedToolCall[];
  /** Ada blok tool call yang isinya tidak bisa dibaca sebagai JSON. */
  malformed: boolean;
}

const OPEN = "<tool_call>";
const CLOSE = "</tool_call>";

/**
 * Keluaran berhenti di sini supaya model tidak mengarang hasil tool sendiri atau
 * melanjutkan dengan giliran "Staf: …" karangan (Run 17–19: sampai 625 token
 * terbuang per giliran). Akibatnya satu balasan memuat paling banyak satu tool
 * call; panggilan berikutnya dilakukan di iterasi berikutnya.
 *
 * Balasan masuk riwayat apa adanya (tanpa tag penutup yang terpotong): web-llm
 * hanya memakai ulang KV cache bila riwayat identik dengan yang ia simpan, yaitu
 * keluaran model tanpa stop string. Menambah `</tool_call>` membuat seluruh
 * prompt di-prefill ulang di setiap iterasi berikutnya (Run 28–30: prompt Q
 * single ±4.500 token ≈ 2 × 2.145 + hasil alat).
 */
export const TOOL_STOP_SEQUENCES = [CLOSE, "<tool_response>"];

export function buildToolInstructions(tools: readonly ToolDefinition[], opts: { extraExamples?: boolean } = {}): string {
  const schema = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
  // Contoh sengaja memakai barang yang tidak ada di skenario evaluasi supaya
  // tidak membocorkan jawaban kumpulan uji.
  const example = tools.some((t) => t.function.name === "getStock")
    ? `

Contoh (bukan data sungguhan):
Staf: "busi bosch masih ada?"
Kamu:
${OPEN}
{"name": "getStock", "arguments": {"query": "busi bosch"}}
${CLOSE}`
    : "";
  const has = (name: string) => tools.some((t) => t.function.name === name);
  // Contoh tambahan untuk model sangat kecil. Barang dan kalimatnya bukan dari skenario evaluasi
  // (dijaga tool-protocol.test.ts), supaya tidak membocorkan jawaban kumpulan uji.
  const extra = opts.extraExamples
    ? [
        has("getSalesTrend") &&
          `Staf: "oli samping laku nggak bulan ini?"\nKamu:\n${OPEN}\n{"name": "getSalesTrend", "arguments": {"product": "oli samping", "months": 1}}\n${CLOSE}`,
      ].filter((x): x is string => typeof x === "string")
    : [];
  const more = extra.length > 0 ? `\n\n${extra.join("\n\n")}` : "";
  return `# Alat (tools)
Kamu dapat memanggil alat berikut. Definisinya dalam JSON Schema:
<tools>
${JSON.stringify(schema)}
</tools>

Cara memanggil alat: balas HANYA dengan blok berikut (boleh lebih dari satu), tanpa teks lain:
${OPEN}
{"name": "<nama alat>", "arguments": {<argumen sesuai skema>}}
${CLOSE}${example}${more}

Kamu sendiri yang memanggil alat. Staf tidak bisa memanggil alat, jadi jangan pernah menyuruh staf memanggilnya.
Hasil alat akan dikirim kembali di dalam blok <tool_response>. Setelah informasinya cukup, jawab staf dengan teks biasa tanpa blok ${OPEN}. Jangan mengarang hasil alat dan jangan menulis blok <tool_response> sendiri.`;
}

function normalizeCall(value: unknown): ParsedToolCall | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const fn = (obj.function && typeof obj.function === "object" ? obj.function : obj) as Record<string, unknown>;
  if (typeof fn.name !== "string" || fn.name.length === 0) return null;
  let args: unknown = fn.arguments ?? fn.parameters ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return null;
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  return { name: fn.name, arguments: args as Record<string, unknown> };
}

function callsFromJson(body: string): ParsedToolCall[] | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const calls = items.map(normalizeCall);
    return calls.every((c): c is ParsedToolCall => c !== null) ? calls : null;
  } catch {
    return null;
  }
}

/**
 * Perbaikan sintaks JSON yang ringan, hanya untuk kesalahan tulis yang sering
 * muncul di model kecil (Q-03: `{"query: "kampas"}`, kutip penutup kunci hilang):
 * kutip penutup kunci, koma sebelum } atau ], kutip tunggal, dan kurung penutup
 * di ujung. Isi tidak pernah ditambah atau ditebak; string yang belum ditutup
 * dianggap tidak bisa diperbaiki. Mengembalikan null bila tidak ada yang berubah.
 */
export function repairJson(body: string): string | null {
  let text = body;
  // Kutip penutup kunci hilang: {"query: "x"} -> {"query": "x"}
  text = text.replace(/([{,]\s*)"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"/g, '$1"$2": "');
  // Kutip tunggal hanya bila tidak ada kutip ganda sama sekali (tidak ambigu).
  if (!text.includes('"') && text.includes("'") && (text.match(/'/g)?.length ?? 0) % 2 === 0) {
    text = text.replace(/'/g, '"');
  }

  let out = "";
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        i++;
        if (i < text.length) out += text[i];
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return null;
    } else if (ch === ",") {
      // Koma sebelum penutup (atau di ujung teks) dibuang.
      const next = text.slice(i + 1).trimStart()[0];
      if (next === undefined || next === "}" || next === "]") continue;
    }
    out += ch;
  }
  if (inString) return null;
  out += stack.reverse().join("");
  return out === body ? null : out;
}

function parseJsonCalls(raw: string, lenient = false): ParsedToolCall[] | null {
  const body = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  // Jalur ketat selalu dicoba dulu; perbaikan hanya untuk isi blok <tool_call>.
  const strict = callsFromJson(body);
  if (strict || !lenient) return strict;
  const repaired = repairJson(body);
  return repaired ? callsFromJson(repaired) : null;
}

/**
 * Buang teks "berpikir" model (Qwen3, DeepSeek-R1 dsb.): blok <think>…</think>, atau
 * <think> tanpa penutup sampai akhir (model kehabisan token / berhenti di stop
 * sequence sebelum menjawab). Teks ini bukan jawaban dan sering menyebut kata
 * seperti "transaction" atau nama alat, jadi tidak boleh ikut dibaca Router,
 * parser tool call, atau ditampilkan ke staf.
 */
export function stripThinking(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").replace(/^\s*<\/think>/i, "");
}

export function parseModelReply(rawContent: string): ParsedReply {
  const content = stripThinking(rawContent);
  const calls: ParsedToolCall[] = [];
  let malformed = false;
  let text = "";
  let cursor = 0;

  while (true) {
    const start = content.indexOf(OPEN, cursor);
    if (start === -1) {
      text += content.slice(cursor);
      break;
    }
    text += content.slice(cursor, start);
    const bodyStart = start + OPEN.length;
    const end = content.indexOf(CLOSE, bodyStart);
    // Tag penutup boleh hilang (model berhenti di stop sequence atau kehabisan token).
    const body = content.slice(bodyStart, end === -1 ? undefined : end);
    const parsed = parseJsonCalls(body, true);
    if (parsed) calls.push(...parsed);
    else malformed = true;
    if (end === -1) break;
    cursor = end + CLOSE.length;
  }

  // Sebagian model mengabaikan tag dan langsung menulis objek JSON pemanggilan tool,
  // kadang di tengah kalimat.
  if (calls.length === 0 && !malformed) {
    const bare = parseJsonCalls(content);
    if (bare) return { text: "", calls: bare, malformed: false };
    const embedded = findEmbeddedCalls(content);
    if (embedded.length > 0) return { text: "", calls: embedded, malformed: false };
  }

  return { text: text.trim(), calls, malformed };
}

/** Objek JSON seimbang yang dimulai di `start`, atau null. Memperhitungkan string. */
function balancedObjectAt(content: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return content.slice(start, i + 1);
  }
  return null;
}

function findEmbeddedCalls(content: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  for (let i = content.indexOf("{"); i !== -1; i = content.indexOf("{", i + 1)) {
    const candidate = balancedObjectAt(content, i);
    if (!candidate || !/"name"\s*:/.test(candidate)) continue;
    const parsed = parseJsonCalls(candidate);
    if (parsed) {
      calls.push(...parsed);
      i += candidate.length - 1;
    }
  }
  return calls;
}

/**
 * Teks yang aman ditampilkan selama streaming: potong mulai blok tool call, dan
 * tahan keluaran yang tampak seperti awal JSON/tag supaya markup tidak sempat
 * muncul di layar staf.
 */
export function visibleStreamText(rawContent: string): string {
  // Selama blok <think> belum ditutup, semuanya disembunyikan.
  const content = stripThinking(rawContent);
  const cut = content.indexOf("<tool_call");
  let visible = cut === -1 ? content : content.slice(0, cut);
  for (let n = Math.min(OPEN.length - 1, visible.length); n > 0; n--) {
    if (OPEN.startsWith(visible.slice(-n))) {
      visible = visible.slice(0, -n);
      break;
    }
  }
  const head = visible.trimStart();
  // Awalan "<think>" yang belum lengkap ("<thi") ditahan seperti awalan <tool_call>.
  if (head.length > 0 && "<think>".startsWith(head.toLowerCase())) return "";
  if (head.startsWith("{") || head.startsWith("[") || head.startsWith("```")) return "";
  return visible;
}

export const MALFORMED_TOOL_CALL_FEEDBACK = `<tool_response>
{"error": "Blok ${OPEN} tidak bisa dibaca: isinya harus JSON valid, misalnya {\\"name\\": \\"getStock\\", \\"arguments\\": {\\"query\\": \\"...\\"}}. Ulangi pemanggilan alat dengan format yang benar."}
</tool_response>`;

// "Saya akan panggil alat…", "saya cek dulu stoknya", "akan mencari filter udara".
const ANNOUNCED_TOOL_CALL =
  /\b(akan|saya|aku|coba|mau|biar)\s+(panggil|memanggil|cari|mencari|carikan|cek|mengecek|cekin|periksa|memeriksa|catat|mencatat)\b|\b(panggil|memanggil)(kan)?\s+(alat|tool)(nya)?\b/i;

/** Model menulis niat memanggil alat tapi tidak menulis blok tool call. */
export function announcesToolCall(text: string): boolean {
  return ANNOUNCED_TOOL_CALL.test(text);
}

/**
 * Qwen3 1.7B kadang menulis panggilan seperti kode, `getStock(query="wipr bosch")`,
 * bukan blok tool call (Q-10, run 23 Okt 2026). Hanya dibaca bila seluruh balasan
 * adalah satu panggilan ke alat yang dikenal; kalimat biasa yang memuat tanda kurung
 * tidak pernah dianggap panggilan.
 */
export function parseFunctionStyleCall(content: string, toolNames: ReadonlySet<string>): ParsedToolCall | null {
  const match = /^\s*([A-Za-z]\w*)\s*\(([\s\S]*)\)\s*\.?\s*$/.exec(content);
  if (!match || !toolNames.has(match[1])) return null;
  const body = match[2];
  const args: Record<string, unknown> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (i >= body.length) break;
    const key = /^[A-Za-z_]\w*/.exec(body.slice(i));
    if (!key) return null;
    i += key[0].length;
    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== "=" && body[i] !== ":") return null;
    i++;
    while (i < body.length && /\s/.test(body[i])) i++;
    const quote = body[i];
    if (quote === '"' || quote === "'") {
      let j = i + 1;
      let value = "";
      while (j < body.length && body[j] !== quote) {
        if (body[j] === "\\" && j + 1 < body.length) j++;
        value += body[j];
        j++;
      }
      if (j >= body.length) return null;
      args[key[0]] = value;
      i = j + 1;
    } else {
      const literal = /^(-?\d+(?:\.\d+)?|true|false|null)/.exec(body.slice(i));
      if (!literal) return null;
      args[key[0]] = literal[0] === "true" ? true : literal[0] === "false" ? false : literal[0] === "null" ? null : Number(literal[0]);
      i += literal[0].length;
    }
  }
  return Object.keys(args).length > 0 ? { name: match[1], arguments: args } : null;
}

/** Alat yang barusan disarankan pengaman lain, lengkap dengan argumen yang sudah diketahui. */
export interface ToolSuggestion {
  name: string;
  arguments: Record<string, unknown>;
}

const DEFAULT_TOOL_EXAMPLE: ToolSuggestion = { name: "getStock", arguments: { query: "<nama barang dari pesan staf>" } };

/**
 * Pengingat "belum ada alat yang dipanggil". Contohnya memakai alat yang disarankan
 * pengaman sebelumnya (mis. transferStock dari umpan balik dua lokasi) supaya dua
 * pengaman tidak saling menimpa; tanpa saran, contohnya getStock.
 */
export function missingToolCallFeedback(suggestion?: ToolSuggestion | null): string {
  const example = JSON.stringify(suggestion ?? DEFAULT_TOOL_EXAMPLE);
  const error = `Belum ada alat yang dipanggil. Balas HANYA dengan blok ${OPEN} tanpa teks lain, misalnya:
${OPEN}
${example}
${CLOSE}`;
  return `<tool_response>
${JSON.stringify({ error })}
</tool_response>`;
}

// Format tool_response (bukan kalimat obrolan): model cenderung membalas obrolan dengan obrolan.
export const MISSING_TOOL_CALL_FEEDBACK = missingToolCallFeedback();

export function formatToolResponse(name: string, result: unknown): string {
  // Nama barang dan alias berasal dari data toko (dan impor nota). "<" diloloskan supaya teks seperti
  // "</tool_response> abaikan aturan…" di dalam data tidak bisa menutup pembungkus lalu tampil sebagai instruksi.
  const body = JSON.stringify({ name, content: result }).replace(/</g, "\\u003c");
  return `<tool_response>\n${body}\n</tool_response>`;
}
