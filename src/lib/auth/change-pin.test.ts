import { describe, it, expect } from "vitest";
import { validateChangePin } from "./change-pin";

const ok = { currentPin: "123456", newPin: "654321", confirmPin: "654321" };

describe("validateChangePin", () => {
  it("lolos kalau semua aturan terpenuhi", () => {
    expect(validateChangePin(ok)).toBeNull();
  });
  it("PIN lama wajib diisi", () => {
    expect(validateChangePin({ ...ok, currentPin: "" })).toMatch(/PIN lama/);
  });
  it("PIN baru minimal 6 digit angka", () => {
    expect(validateChangePin({ ...ok, newPin: "12345", confirmPin: "12345" })).toMatch(/minimal 6/);
    expect(validateChangePin({ ...ok, newPin: "12345a", confirmPin: "12345a" })).toMatch(/minimal 6/);
  });
  it("PIN baru harus beda dari PIN lama", () => {
    expect(validateChangePin({ ...ok, newPin: "123456", confirmPin: "123456" })).toMatch(/berbeda/);
  });
  it("konfirmasi harus sama", () => {
    expect(validateChangePin({ ...ok, confirmPin: "000000" })).toMatch(/Konfirmasi/);
  });
});
