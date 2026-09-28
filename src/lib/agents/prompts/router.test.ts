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
  ])("%s → %s", (text: string, expected: ReturnType<typeof parseRouterReply>) => {
    expect(parseRouterReply(text)).toBe(expected);
  });
});
