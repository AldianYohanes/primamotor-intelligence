import { describe, it, expect } from "vitest";
import { buildRouterInput, parseRouterReply } from "@/src/lib/agents/prompts/router";

describe("buildRouterInput", () => {
  it("tanpa balasan sebelumnya, pesan diteruskan apa adanya", () => {
    expect(buildRouterInput("stok radiator?")).toBe("stok radiator?");
    expect(buildRouterInput("stok radiator?", "  ")).toBe("stok radiator?");
  });

  it("menyertakan balasan terakhir untuk pesan lanjutan", () => {
    const input = buildRouterInput("Kenapa stoknya berubah?", "Radiator Volvo 240 di toko ada 3.");
    expect(input).toContain('Balasan asisten sebelumnya: "Radiator Volvo 240 di toko ada 3."');
    expect(input).toContain("Pesan staf: Kenapa stoknya berubah?");
  });

  it("memotong balasan yang panjang", () => {
    expect(buildRouterInput("ok", "x".repeat(1000)).length).toBeLessThan(400);
  });
});

describe("parseRouterReply", () => {
  it.each<[string, ReturnType<typeof parseRouterReply>]>([
    ["TRANSACTION_AGENT", "transaction"],
    ["TRANSACTION", "transaction"],
    ["transaction_agent", "transaction"],
    ["QUERY_AGENT", "query"],
    ["QUERY AGENT.", "query"],
    ["OFF_TOPIC", "off_topic"],
    ["Maaf, saya hanya membantu urusan stok.", "off_topic"],
    ["", "off_topic"],
    ["query", "query"],
    ["Transaction.", "transaction"],
    ["off topic", "off_topic"],
    ["  **QUERY_AGENT**", "query"],
  ])("%s → %s", (text: string, expected: ReturnType<typeof parseRouterReply>) => {
    expect(parseRouterReply(text)).toBe(expected);
  });
});

describe("parseRouterReply dengan teks berpikir", () => {
  it("<think> yang menyebut transaction tidak menentukan rute (pertanyaan stok)", () => {
    const reply =
      "<think>\nThe user asks about stock of a radiator, not a transaction. The agent should be QUERY_AGENT, not TRANSACTION_AGENT.\n</think>\n\nQUERY_AGENT";
    expect(parseRouterReply(reply)).toBe("query");
  });

  it("<think> yang menyebut transaction tapi jawabannya OFF_TOPIC", () => {
    const reply = "<think>Greeting only. No transaction or query is requested.</think>OFF_TOPIC";
    expect(parseRouterReply(reply)).toBe("off_topic");
  });

  it("<think> tanpa penutup: tidak ada jawaban, jatuh ke off_topic", () => {
    expect(parseRouterReply("<think>Maybe this is a transaction, since the user says masuk 3 busi")).toBe("off_topic");
  });

  it("jawaban transaksi sesudah <think> tetap terbaca", () => {
    expect(parseRouterReply("<think>masuk = incoming goods</think>\nTRANSACTION_AGENT")).toBe("transaction");
  });
});
