import { describe, it, expect } from "vitest";
import { DEFAULT_PROFILE, getModelProfile } from "@/src/lib/agents/model-profile";
import { MODEL_OPTIONS } from "@/src/lib/agents/model-options";
import {
  ROUTER_COMPACT_SYSTEM_PROMPT,
  ROUTER_GRAMMAR,
  parseRouterReply,
  parseRouterReplyOrNull,
} from "@/src/lib/agents/prompts/router";
import scenarios from "@/src/lib/eval/scenarios.json";

describe("getModelProfile", () => {
  it("Qwen3 kecil memakai Router terbatas dan prompt ringkas", () => {
    for (const id of ["Qwen3-1.7B-q4f16_1-MLC", "Qwen3-1.7B-q4f32_1-MLC", "Qwen3-0.6B-q4f16_1-MLC"]) {
      expect(getModelProfile(id)).toEqual({ routerGrammar: true, routerPrompt: "compact", routerRecovery: true, agentRecovery: true });
    }
  });

  it("model lain tetap memakai perilaku lama", () => {
    for (const option of MODEL_OPTIONS.filter((o) => !/qwen3/i.test(o.id))) {
      expect(getModelProfile(option.id)).toBe(DEFAULT_PROFILE);
    }
    expect(DEFAULT_PROFILE).toEqual({ routerGrammar: false, routerPrompt: "default", routerRecovery: false, agentRecovery: false });
  });

  it("Qwen3 ukuran besar belum punya profil khusus", () => {
    expect(getModelProfile("Qwen3-4B-q4f16_1-MLC")).toBe(DEFAULT_PROFILE);
  });
});

describe("parseRouterReplyOrNull", () => {
  it("mengenali tiga label, termasuk bentuk terpotong", () => {
    expect(parseRouterReplyOrNull("QUERY_AGENT")).toBe("query");
    expect(parseRouterReplyOrNull("<think>\n\n</think>\n\nTRANSACTION")).toBe("transaction");
    expect(parseRouterReplyOrNull("OFF_TOPIC")).toBe("off_topic");
  });

  it("null untuk balasan tanpa label", () => {
    expect(parseRouterReplyOrNull("Sisa filter oli mahle berapa di toko?")).toBeNull();
    expect(parseRouterReplyOrNull("KEJAUSTAN_AGENT")).toBeNull();
    expect(parseRouterReplyOrNull("transfer")).toBeNull();
  });

  it("parseRouterReply tetap jatuh ke OFF_TOPIC untuk balasan tanpa label", () => {
    expect(parseRouterReply("Sisa filter oli mahle berapa di toko?")).toBe("off_topic");
  });
});

describe("Router Qwen3", () => {
  it("grammar hanya mengizinkan tiga label yang dikenali parser", () => {
    for (const label of ["QUERY_AGENT", "TRANSACTION_AGENT", "OFF_TOPIC"]) {
      expect(ROUTER_GRAMMAR).toContain(`"${label}"`);
      expect(parseRouterReplyOrNull(label)).not.toBeNull();
    }
  });

  it("contoh di prompt ringkas tidak menyalin pesan skenario evaluasi", () => {
    const examples = [...ROUTER_COMPACT_SYSTEM_PROMPT.matchAll(/^"(.+)" -> /gm)].map((m) => m[1].toLowerCase());
    expect(examples.length).toBeGreaterThanOrEqual(10);
    const all = (scenarios as { scenarios: { message: string }[] }).scenarios.map((s) => s.message.toLowerCase());
    for (const example of examples) expect(all).not.toContain(example);
  });
});
