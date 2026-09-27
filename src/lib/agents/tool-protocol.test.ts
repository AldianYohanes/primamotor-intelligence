import { describe, it, expect } from "vitest";
import {
  buildToolInstructions,
  formatToolResponse,
  parseModelReply,
  visibleStreamText,
} from "@/src/lib/agents/tool-protocol";

describe("parseModelReply", () => {
  it("membaca satu blok tool_call gaya Hermes/Qwen", () => {
    const r = parseModelReply('<tool_call>\n{"name": "getStock", "arguments": {"query": "radiator 240"}}\n</tool_call>');
    expect(r.calls).toEqual([{ name: "getStock", arguments: { query: "radiator 240" } }]);
    expect(r.text).toBe("");
    expect(r.malformed).toBe(false);
  });

  it("membaca beberapa blok dan menyisakan teks di luar blok", () => {
    const r = parseModelReply(
      'Sebentar saya cek.\n<tool_call>{"name":"getStock","arguments":{"query":"a"}}</tool_call><tool_call>{"name":"getStock","arguments":{"query":"b"}}</tool_call>',
    );
    expect(r.calls.map((c) => c.arguments.query)).toEqual(["a", "b"]);
    expect(r.text).toBe("Sebentar saya cek.");
  });

  it("menerima tag penutup yang hilang karena stop sequence", () => {
    const r = parseModelReply('<tool_call>\n{"name": "getSalesTrend", "arguments": {"product_id": "p1", "months": 3}}\n');
    expect(r.calls).toEqual([{ name: "getSalesTrend", arguments: { product_id: "p1", months: 3 } }]);
  });

  it("menerima arguments berupa string JSON dan bentuk {function: {...}}", () => {
    const r = parseModelReply(
      '<tool_call>{"function": {"name": "getStock", "arguments": "{\\"query\\": \\"karbu\\"}"}}</tool_call>',
    );
    expect(r.calls).toEqual([{ name: "getStock", arguments: { query: "karbu" } }]);
  });

  it("menerima objek JSON tanpa tag, termasuk dalam code fence", () => {
    expect(parseModelReply('{"name": "getStock", "arguments": {"query": "wiper"}}').calls).toHaveLength(1);
    expect(parseModelReply('```json\n{"name": "getStock", "arguments": {"query": "wiper"}}\n```').calls).toHaveLength(1);
  });

  it("menemukan objek pemanggilan tool yang ditulis di tengah kalimat (Qwen2.5 3B, run 27 Sep)", () => {
    const r = parseModelReply(
      'Hanya bisa melihat dari hasil getStock: {"name": "getStock", "arguments": {"query": "kampas rem depan brembo", "limit": 5}}',
    );
    expect(r.calls).toEqual([{ name: "getStock", arguments: { query: "kampas rem depan brembo", limit: 5 } }]);
  });

  it("kurung kurawal biasa di dalam jawaban tidak dianggap tool call", () => {
    const r = parseModelReply('Formatnya {"catatan": "bukan tool"} ya.');
    expect(r.calls).toEqual([]);
  });

  it("jawaban teks biasa tidak dianggap pemanggilan tool", () => {
    const r = parseModelReply("Radiator 240 tersedia 2 unit di Toko.");
    expect(r.calls).toEqual([]);
    expect(r.text).toBe("Radiator 240 tersedia 2 unit di Toko.");
  });

  it("menandai blok yang JSON-nya rusak", () => {
    const r = parseModelReply('<tool_call>{"name": "getStock", "arguments": {query: radiator}}</tool_call>');
    expect(r.calls).toEqual([]);
    expect(r.malformed).toBe(true);
  });
});

describe("visibleStreamText", () => {
  it("menyembunyikan blok tool_call dan awalan tag yang belum lengkap", () => {
    expect(visibleStreamText("Sebentar <tool_call>{")).toBe("Sebentar ");
    expect(visibleStreamText("Sebentar <too")).toBe("Sebentar ");
    expect(visibleStreamText('{"name": "getSt')).toBe("");
    expect(visibleStreamText("Stoknya ada 2")).toBe("Stoknya ada 2");
  });
});

describe("format", () => {
  it("instruksi memuat nama tool dan format pemanggilan", () => {
    const text = buildToolInstructions([
      { type: "function", function: { name: "getStock", description: "cari", parameters: { type: "object" } } },
    ]);
    expect(text).toContain('"name":"getStock"');
    expect(text).toContain("<tool_call>");
    expect(text).toContain("busi bosch");
  });

  it("contoh getStock tidak ditampilkan untuk agent tanpa getStock", () => {
    const text = buildToolInstructions([
      { type: "function", function: { name: "getSalesTrend", parameters: { type: "object" } } },
    ]);
    expect(text).not.toContain("busi bosch");
  });

  it("hasil tool dibungkus tool_response", () => {
    expect(formatToolResponse("getStock", { results: [] })).toBe(
      '<tool_response>\n{"name":"getStock","content":{"results":[]}}\n</tool_response>',
    );
  });
});
