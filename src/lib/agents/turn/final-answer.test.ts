import { describe, it, expect } from "vitest";
import { composeFinalAnswer, hasCodeAnswer } from "@/src/lib/agents/turn/final-answer";
import { ProcessRecorder } from "@/src/lib/agents/process-trace";

const stockResult = {
  results: [
    {
      product_id: "p1",
      name: "Radiator Volvo 240",
      stock_by_location: [
        { location_id: "toko", location_name: "Toko", quantity: 2, available_quantity: 2 },
        { location_id: "gudang", location_name: "Gudang", quantity: 3, available_quantity: 3 },
      ],
    },
  ],
};
const toolTrace = [{ name: "getStock", args: { query: "Radiator Volvo 240" }, result: stockResult }];

function compose(over: { text?: string; malformed?: boolean; answerFromToolResult?: boolean }) {
  const { text = "", malformed = false, answerFromToolResult } = over;
  return composeFinalAnswer({
    agentType: "query",
    toolTrace,
    reply: { text, calls: [], malformed },
    content: text,
    readOnlyPin: false,
    readOnlyPinSeen: false,
    pinProductNames: [],
    textBeforeNudge: "",
    rec: new ProcessRecorder(),
    ...(answerFromToolResult === undefined ? {} : { answerFromToolResult }),
  });
}

describe("composeFinalAnswer, model kosong sesudah alat baca", () => {
  it("menyusun jawaban dari hasil getStock, bukan permintaan maaf (Q-01 Qwen3.5 0.8B)", () => {
    const out = compose({ malformed: true });
    expect(out.assistantText).toContain("Radiator Volvo 240");
    expect(out.assistantText).toContain("Toko 2");
    expect(out.assistantText).not.toContain("Maaf");
  });

  it("saklar dimatikan: perilaku lama (permintaan maaf)", () => {
    expect(compose({ malformed: true, answerFromToolResult: false }).assistantText).toContain("Maaf");
  });

  it("teks model yang tidak bertentangan dengan data tetap dipakai", () => {
    expect(compose({ text: "Radiator ada, Toko 2 dan Gudang 3." }).assistantText).toBe("Radiator ada, Toko 2 dan Gudang 3.");
  });
});

describe("hasCodeAnswer", () => {
  it("benar bila hasil getStock bisa diringkas", () => {
    expect(hasCodeAnswer(toolTrace)).toBe(true);
  });
  it("salah tanpa alat baca atau hasil kosong", () => {
    expect(hasCodeAnswer([])).toBe(false);
    expect(hasCodeAnswer([{ name: "getStock", args: {}, result: { results: [] } }])).toBe(false);
  });
});
