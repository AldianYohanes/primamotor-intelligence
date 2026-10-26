import { describe, it, expect } from "vitest";
import { DEFAULT_PROFILE, RAW_PROFILE, getModelProfile, setCodeGuardsOff } from "@/src/lib/agents/model-profile";
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
      expect(getModelProfile(id)).toEqual({ routerGrammar: true, routerPrompt: "compact", routerRecovery: true, agentRecovery: true, nudgeMissingCall: true, answerFromToolResult: true, maxAgentTokens: 400, constrainedToolCall: false, toolExamples: false, skipRouterForMovement: true, catalogRouting: true });
    }
  });

  it("model lain tetap memakai perilaku lama", () => {
    for (const option of MODEL_OPTIONS.filter((o) => !/qwen3/i.test(o.id))) {
      expect(getModelProfile(option.id)).toBe(DEFAULT_PROFILE);
    }
    expect(DEFAULT_PROFILE).toEqual({ routerGrammar: false, routerPrompt: "default", routerRecovery: false, agentRecovery: false, nudgeMissingCall: true, answerFromToolResult: true, maxAgentTokens: 400, constrainedToolCall: false, toolExamples: false, skipRouterForMovement: false, catalogRouting: true });
  });

  it("Qwen3 ukuran besar belum punya profil khusus", () => {
    expect(getModelProfile("Qwen3-4B-q4f16_1-MLC")).toBe(DEFAULT_PROFILE);
  });
});

describe("profil Qwen3.5 0.8B dan model mentah", () => {
  it("Qwen3.5 0.8B memakai profil kecil dengan alat dipaksa valid dan contoh tambahan", () => {
    for (const id of ["Qwen3.5-0.8B-q4f16_1-MLC", "Qwen3.5-0.8B-q4f32_1-MLC"]) {
      expect(getModelProfile(id)).toMatchObject({ routerGrammar: true, agentRecovery: true, constrainedToolCall: true, toolExamples: true });
    }
    expect(getModelProfile("Qwen3-1.7B-q4f16_1-MLC")).toMatchObject({ constrainedToolCall: false, toolExamples: false });
  });

  it("saklar pengaman mati memakai RAW_PROFILE untuk model apa pun, lalu kembali normal", () => {
    setCodeGuardsOff(true);
    try {
      expect(getModelProfile("Qwen3.5-0.8B-q4f16_1-MLC")).toBe(RAW_PROFILE);
      expect(getModelProfile("Qwen2.5-3B-Instruct-q4f16_1-MLC")).toBe(RAW_PROFILE);
    } finally {
      setCodeGuardsOff(false);
    }
    expect(getModelProfile("Qwen2.5-3B-Instruct-q4f16_1-MLC")).toBe(DEFAULT_PROFILE);
  });

  it("RAW_PROFILE mematikan semua pengaman profil", () => {
    expect(Object.values(RAW_PROFILE).filter((v) => v === true)).toHaveLength(0);
    expect(RAW_PROFILE.maxAgentTokens).toBeNull();
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
