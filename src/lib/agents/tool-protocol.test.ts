import { describe, it, expect } from "vitest";
import { AGENT_TOOL_DEFINITIONS } from "@/src/lib/agents/tool-schemas";
import scenarios from "@/src/lib/eval/scenarios.json";
import {
  announcesToolCall,
  buildToolInstructions,
  formatToolResponse,
  MISSING_TOOL_CALL_FEEDBACK,
  missingToolCallFeedback,
  parseModelReply,
  repairJson,
  stripThinking,
  visibleStreamText,
} from "@/src/lib/agents/tool-protocol";

describe("announcesToolCall", () => {
  it.each<[string]>([
    ["Baik, saya akan mencari berdasarkan istilahnya. Saya akan panggil alat untuk mencari filter udara."],
    ["Oke, aku cek dulu stoknya ya."],
    ["Sebentar, saya periksa dulu."],
    ["Saya akan memanggil tool getStock."],
    ["Ya, memanggil alatnya. Filter udara, ada yang tersedia untuk diupdate?"],
  ])("mendeteksi niat tanpa pemanggilan: %s", (text: string) => {
    expect(announcesToolCall(text)).toBe(true);
  });

  it.each<[string]>([
    ["Maaf, saya hanya bisa membantu urusan stok & suku cadang toko ini."],
    ["Stok Filter Oli Mahle ada 25 unit di Toko dan 60 unit di Gudang."],
    ["Lampu yang mana, dan berapa unit? Dari toko atau gudang?"],
    ["Toko buka jam 8 pagi."],
  ])("tidak menganggap jawaban biasa sebagai niat: %s", (text: string) => {
    expect(announcesToolCall(text)).toBe(false);
  });
});

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

describe("parseModelReply: perbaikan JSON ringan", () => {
  const wrap = (body: string) => `<tool_call>\n${body}`;

  it("memperbaiki kutip penutup kunci yang hilang (Q-03)", () => {
    const r = parseModelReply(wrap('{"name": "getStock", "arguments": {"query: "kampas rem brembo gudang"}}'));
    expect(r.malformed).toBe(false);
    expect(r.calls).toEqual([{ name: "getStock", arguments: { query: "kampas rem brembo gudang" } }]);
  });

  it("membuang koma berlebih sebelum } dan ]", () => {
    const r = parseModelReply(wrap('{"name": "getStock", "arguments": {"query": "busi",},}\n</tool_call>'));
    expect(r.malformed).toBe(false);
    expect(r.calls[0].arguments).toEqual({ query: "busi" });
  });

  it("menambah kurung penutup yang hilang di ujung", () => {
    const r = parseModelReply(wrap('{"name": "getStock", "arguments": {"query": "busi"'));
    expect(r.calls).toEqual([{ name: "getStock", arguments: { query: "busi" } }]);
  });

  it("membaca kutip tunggal bila tidak ada kutip ganda", () => {
    const r = parseModelReply(wrap("{'name': 'getStock', 'arguments': {'query': 'busi'}}"));
    expect(r.calls).toEqual([{ name: "getStock", arguments: { query: "busi" } }]);
  });

  it("tidak menebak isi: string belum ditutup tetap rusak", () => {
    const r = parseModelReply(wrap('{"name": "getStock", "arguments": {"query": "busi'));
    expect(r.calls).toEqual([]);
    expect(r.malformed).toBe(true);
  });

  it("kurung berlebih atau tidak seimbang tetap rusak", () => {
    expect(parseModelReply(wrap('{"name": "getStock", "arguments": {"query": "x"}}}}')).malformed).toBe(true);
    expect(parseModelReply(wrap("bukan json sama sekali")).malformed).toBe(true);
  });

  it("jalur ketat tetap dipakai lebih dulu untuk JSON valid", () => {
    const r = parseModelReply(wrap('{"name": "getStock", "arguments": {"query": "kunci, \\"pas\\": 10"}}'));
    expect(r.calls[0].arguments).toEqual({ query: 'kunci, "pas": 10' });
  });
});

describe("repairJson", () => {
  it("mengembalikan null bila tidak ada yang perlu diperbaiki", () => {
    expect(repairJson('{"a": 1}')).toBeNull();
  });
  it("koma di dalam string tidak disentuh", () => {
    expect(repairJson('{"a": "x,}"')).toBe('{"a": "x,}"}');
  });
});

describe("missingToolCallFeedback", () => {
  const errorOf = (text: string): string => {
    const body = text.slice("<tool_response>".length, text.length - "</tool_response>".length);
    return (JSON.parse(body) as { error: string }).error;
  };

  it("tanpa saran: sama dengan pengingat bawaan (contoh getStock)", () => {
    expect(missingToolCallFeedback()).toBe(MISSING_TOOL_CALL_FEEDBACK);
    expect(missingToolCallFeedback(null)).toBe(MISSING_TOOL_CALL_FEEDBACK);
    expect(errorOf(MISSING_TOOL_CALL_FEEDBACK)).toContain("getStock");
  });

  it("T-07: dengan saran transferStock, contoh pengingat memakai transferStock, bukan getStock", () => {
    const text = missingToolCallFeedback({
      name: "transferStock",
      arguments: { product: "lampu belakang kiri", quantity: 2, from_location: "Gudang", to_location: "Toko" },
    });
    expect(text.startsWith("<tool_response>")).toBe(true);
    expect(text).toContain("transferStock");
    expect(text).toContain("lampu belakang kiri");
    expect(text).not.toContain("getStock");
  });

  it("contoh di pengingat bisa dibaca parseModelReply sebagai tool call valid", () => {
    const suggestion = { name: "transferStock", arguments: { product: "busi", quantity: 3 } };
    const error = errorOf(missingToolCallFeedback(suggestion));
    const parsed = parseModelReply(error.slice(error.lastIndexOf("<tool_call>")));
    expect(parsed.calls).toEqual([suggestion]);
  });
});

describe("stripThinking", () => {
  it("membuang blok <think> dan menyisakan jawaban", () => {
    expect(stripThinking("<think>\nmikir dulu\n</think>\n\nStok radiator ada 3.").trim()).toBe("Stok radiator ada 3.");
  });

  it("membuang <think> tanpa penutup sampai akhir", () => {
    expect(stripThinking("<think>belum selesai mikir")).toBe("");
  });

  it("teks biasa tidak berubah", () => {
    expect(stripThinking("  Stok ada 3. ")).toBe("  Stok ada 3. ");
  });

  it("parseModelReply tidak membaca tool call yang hanya disebut di dalam <think>", () => {
    const reply = parseModelReply(
      '<think>Perlu <tool_call>{"name": "getStock", "arguments": {"query": "x"}}</tool_call>?</think>Ada 3 pcs.',
    );
    expect(reply.calls).toEqual([]);
    expect(reply.text).toBe("Ada 3 pcs.");
  });

  it("parseModelReply tetap membaca tool call sesudah <think>", () => {
    const reply = parseModelReply(
      '<think>cek stok</think><tool_call>{"name": "getStock", "arguments": {"query": "busi"}}</tool_call>',
    );
    expect(reply.calls).toHaveLength(1);
    expect(reply.calls[0].name).toBe("getStock");
  });

  it("visibleStreamText menyembunyikan <think> yang masih terbuka", () => {
    expect(visibleStreamText("<think>sedang mikir")).toBe("");
    expect(visibleStreamText("<thi")).toBe("");
    expect(visibleStreamText("<think>x</think>Halo")).toBe("Halo");
  });
});

describe("contoh alat tambahan", () => {
  const tools = AGENT_TOOL_DEFINITIONS;
  it("hanya muncul bila diminta dan tidak memakai kalimat atau barang skenario evaluasi", () => {
    expect(buildToolInstructions(tools)).not.toContain("kabel kopling");
    const text = buildToolInstructions(tools, { extraExamples: true });
    expect(text).toContain("kabel kopling");
    const messages = (scenarios as { scenarios: { message: string }[] }).scenarios.map((s) => s.message.toLowerCase());
    for (const item of ["kabel kopling", "selang rem", "oli samping"]) {
      expect(messages.some((m) => m.includes(item))).toBe(false);
    }
  });

  it("contoh hanya untuk alat yang tersedia", () => {
    const query = tools.filter((t) => ["getStock", "getSalesTrend"].includes(t.function.name));
    const text = buildToolInstructions(query, { extraExamples: true });
    expect(text).toContain("oli samping");
    expect(text).not.toContain("kabel kopling");
  });
});
