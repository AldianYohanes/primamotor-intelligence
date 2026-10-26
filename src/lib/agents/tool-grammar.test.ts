import { describe, it, expect } from "vitest";
import { toolCallGrammar } from "@/src/lib/agents/tool-grammar";
import { AGENT_TOOL_DEFINITIONS } from "@/src/lib/agents/tool-schemas";

const byName = (names: string[]) => AGENT_TOOL_DEFINITIONS.filter((t) => names.includes(t.function.name));

describe("toolCallGrammar", () => {
  it("query agent: getStock dan getSalesTrend saja", () => {
    const g = toolCallGrammar(byName(["getStock", "getSalesTrend"]));
    expect(g).toContain('root ::= "<tool_call>\\n" call');
    expect(g).toContain('\\"name\\": \\"getStock\\"');
    expect(g).toContain('\\"name\\": \\"getSalesTrend\\"');
    expect(g).not.toContain("updateStock");
  });

  it("argumen wajib dulu, opsional dibuat opsional, enum jadi pilihan", () => {
    const g = toolCallGrammar(byName(["updateStock"]));
    expect(g).toContain('\\"direction\\": ');
    expect(g).toContain('("\\"masuk\\"" | "\\"keluar\\"")');
    expect(g.indexOf("reasoning")).toBeLessThan(g.indexOf("location"));
    expect(g).toMatch(/\(", \\"location\\": " jstr\)\?/);
  });

  it("aturan dasar string dan angka ada", () => {
    const g = toolCallGrammar(byName(["getStock"]));
    expect(g).toContain("jstr ::=");
    expect(g).toContain("jnum ::= [0-9]+");
    expect(g).toMatch(/\(", \\"limit\\": " jnum\)\?/);
  });
});
