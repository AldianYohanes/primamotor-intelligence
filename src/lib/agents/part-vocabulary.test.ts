import { describe, it, expect } from "vitest";
import { mentionsSparePart } from "@/src/lib/agents/off-topic";
import { guardRoute } from "@/src/lib/agents/route-guard";
import { EXTRA_PART_TERMS } from "@/src/lib/agents/part-vocabulary";
import scenarios from "@/src/lib/eval/scenarios.json";

describe("kosakata suku cadang tambahan", () => {
  it("dikenali hanya bila diminta, daftar lama tidak berubah", () => {
    expect(mentionsSparePart("stok kampas kopling berapa?", true)).toBe(true);
    expect(mentionsSparePart("ada tie rod end?", true)).toBe(true);
    expect(mentionsSparePart("stok pompa bensin", false)).toBe(false);
    expect(guardRoute("off_topic", "water pump ada gak?").agentType).toBe("off_topic");
    expect(guardRoute("off_topic", "water pump ada gak?", { catalog: true }).agentType).toBe("query");
  });

  it("tidak menganggap pesan biasa sebagai barang", () => {
    for (const msg of ["selamat pagi", "baterai hp saya habis", "berapa jam toko buka?", "tolong buatkan puisi", "jok kursi kantor rusak"]) {
      expect(mentionsSparePart(msg, true)).toBe(false);
    }
  });

  it("tiap istilah tambahan dikenali pencocok sendiri", () => {
    for (const term of EXTRA_PART_TERMS) expect(mentionsSparePart(`stok ${term} berapa`, true), term).toBe(true);
  });

  it("pesan skenario off-topic hanya berubah bila memang menyebut barang baru", () => {
    const off = (scenarios as { scenarios: { message: string; expected_route: string }[] }).scenarios.filter((s) => s.expected_route === "off_topic");
    const changed = off.filter((s) => mentionsSparePart(s.message, true) && !mentionsSparePart(s.message, false)).map((s) => s.message);
    expect(changed).toEqual([]);
  });
});

describe("pelipatan ejaan", () => {
  it("c dan k, ph dan f, huruf ganda dianggap sama", async () => {
    const { foldSpelling, wordInTokens } = await import("@/src/lib/agents/catalog-match");
    expect(foldSpelling("carburator")).toBe(foldSpelling("karburator"));
    expect(foldSpelling("phanbelt")).toBe(foldSpelling("fanbelt"));
    expect(foldSpelling("koppling")).toBe(foldSpelling("kopling"));
    expect(foldSpelling("chrome")).toBe("chrome");
    expect(wordInTokens("cambelt", ["kambelt"])).toBe(true);
    expect(wordInTokens("radiator", ["bearing"])).toBe(false);
  });
});
