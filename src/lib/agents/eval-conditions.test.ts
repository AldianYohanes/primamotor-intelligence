import { afterEach, describe, expect, it } from "vitest";
import { isCodeRouterOn, isSingleParityOn, setCodeRouter, setSingleParity } from "@/src/lib/agents/eval-conditions";

describe("kondisi pembanding /eval", () => {
  afterEach(() => {
    setSingleParity(false);
    setCodeRouter(false);
  });

  it("default mati", () => {
    expect(isSingleParityOn()).toBe(false);
    expect(isCodeRouterOn()).toBe(false);
  });

  it("saklar berdiri sendiri", () => {
    setSingleParity(true);
    expect(isSingleParityOn()).toBe(true);
    expect(isCodeRouterOn()).toBe(false);
    setCodeRouter(true);
    expect(isCodeRouterOn()).toBe(true);
  });
});
