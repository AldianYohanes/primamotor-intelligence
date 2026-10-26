import { describe, expect, it } from "vitest";
import { liveCallText, pinDigitsLeft, shouldSubmitOnEnter, turnErrorMessage, waitHint } from "./chat-ui";

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

describe("waitHint", () => {
  it("diam selama masih cepat, lalu menjelaskan, lalu menyarankan langkah", () => {
    expect(waitHint(5_000)).toBeNull();
    expect(waitHint(20_000)).toContain("30 sampai 90 detik");
    expect(waitHint(130_000)).toContain("Hentikan");
    expect(waitHint(130_000)).not.toEqual(waitHint(20_000));
  });
});

describe("liveCallText", () => {
  it("memakai kata staf untuk Router dan agent", () => {
    expect(liveCallText("Router", 0)).toBe("Menentukan jenis pertanyaan, membaca pesan");
    expect(liveCallText("Agent", 12)).toBe("Menyusun jawaban");
    expect(liveCallText("Router", 3)).not.toContain("token");
  });
});
