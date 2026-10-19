import { describe, expect, it } from "vitest";
import { pinDigitsLeft, shouldSubmitOnEnter, turnErrorMessage } from "./chat-ui";

describe("shouldSubmitOnEnter", () => {
  it("Enter biasa mengirim", () => {
    expect(shouldSubmitOnEnter({ key: "Enter" })).toBe(true);
  });
  it("tidak mengirim saat IME menyusun kata atau Shift ditekan", () => {
    expect(shouldSubmitOnEnter({ key: "Enter", isComposing: true })).toBe(false);
    expect(shouldSubmitOnEnter({ key: "Enter", shiftKey: true })).toBe(false);
    expect(shouldSubmitOnEnter({ key: "a" })).toBe(false);
  });
});

describe("turnErrorMessage", () => {
  it("menyebut langkah berikutnya, beda untuk offline", () => {
    expect(turnErrorMessage(true)).toContain("kirim ulang");
    expect(turnErrorMessage(false)).toContain("internet");
  });
});

describe("pinDigitsLeft", () => {
  it("menghitung sisa digit", () => {
    expect(pinDigitsLeft("12")).toBe(4);
    expect(pinDigitsLeft("123456")).toBe(0);
    expect(pinDigitsLeft("12345678")).toBe(0);
  });
});
