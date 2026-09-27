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

/** Keluaran berhenti di sini supaya model tidak mengarang hasil tool sendiri. */
export const TOOL_STOP_SEQUENCES = ["<tool_response>"];

export function buildToolInstructions(tools: readonly ToolDefinition[]): string {
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
  return `# Alat (tools)
Kamu dapat memanggil alat berikut. Definisinya dalam JSON Schema:
<tools>
${JSON.stringify(schema)}
</tools>

Cara memanggil alat: balas HANYA dengan blok berikut (boleh lebih dari satu), tanpa teks lain:
${OPEN}
{"name": "<nama alat>", "arguments": {<argumen sesuai skema>}}
${CLOSE}${example}

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

function parseJsonCalls(raw: string): ParsedToolCall[] | null {
  const body = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(body);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const calls = items.map(normalizeCall);
    return calls.every((c): c is ParsedToolCall => c !== null) ? calls : null;
  } catch {
    return null;
  }
}

export function parseModelReply(content: string): ParsedReply {
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
    const parsed = parseJsonCalls(body);
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
export function visibleStreamText(content: string): string {
  const cut = content.indexOf("<tool_call");
  let visible = cut === -1 ? content : content.slice(0, cut);
  for (let n = Math.min(OPEN.length - 1, visible.length); n > 0; n--) {
    if (OPEN.startsWith(visible.slice(-n))) {
      visible = visible.slice(0, -n);
      break;
    }
  }
  const head = visible.trimStart();
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

// Format tool_response (bukan kalimat obrolan): model cenderung membalas obrolan dengan obrolan.
export const MISSING_TOOL_CALL_FEEDBACK = `<tool_response>
{"error": "Belum ada alat yang dipanggil. Balas HANYA dengan blok ${OPEN} tanpa teks lain, misalnya:\\n${OPEN}\\n{\\"name\\": \\"getStock\\", \\"arguments\\": {\\"query\\": \\"<nama barang dari pesan staf>\\"}}\\n${CLOSE}"}
</tool_response>`;

export function formatToolResponse(name: string, result: unknown): string {
  return `<tool_response>\n${JSON.stringify({ name, content: result })}\n</tool_response>`;
}
