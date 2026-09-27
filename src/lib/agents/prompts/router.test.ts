import { describe, it, expect } from "vitest";
import { parseRouterReply } from "@/src/lib/agents/prompts/router";

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
