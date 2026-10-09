import { describe, it, expect } from "vitest";
import {
  lockedFailure,
  pinFailureBody,
  unlockTimeHint,
  wrongPinFailure,
} from "@/src/lib/auth/lockout-messages";

const NOW = Date.UTC(2026, 9, 9, 7, 0, 0);

describe("wrongPinFailure", () => {
  it("menyebut sisa percobaan sebelum terkunci", () => {
    const f = wrongPinFailure(3, NOW);
    expect(f).toMatchObject({ status: 401, attemptsLeft: 2 });
    expect(f.error).toBe("PIN salah. Sisa 2 percobaan sebelum akun terkunci 15 menit.");
    expect(f.lockedUntil).toBeUndefined();
  });

  it("percobaan ke-5 langsung mengunci dengan status 423 dan waktu buka", () => {
    const f = wrongPinFailure(5, NOW, "Username atau PIN");
    expect(f.status).toBe(423);
    expect(f.error).toBe("Username atau PIN salah 5 kali. Akun terkunci 15 menit.");
    expect(f.lockedUntil).toBe(new Date(NOW + 15 * 60000).toISOString());
  });
});

describe("lockedFailure", () => {
  it("membulatkan sisa menit ke atas", () => {
    const until = new Date(NOW + 90_500).toISOString();
    expect(lockedFailure(until, NOW).error).toBe(
      "Akun terkunci sementara akibat 5× PIN salah, coba lagi dalam 2 menit.",
    );
  });
});

describe("pinFailureBody", () => {
  it("hanya mengirim field yang ada", () => {
    expect(pinFailureBody(wrongPinFailure(1, NOW))).toEqual({
      error: "PIN salah. Sisa 4 percobaan sebelum akun terkunci 15 menit.",
      attempts_left: 4,
    });
    expect(pinFailureBody(lockedFailure(new Date(NOW + 60000).toISOString(), NOW))).toHaveProperty("locked_until");
  });
});

describe("unlockTimeHint", () => {
  it("kosong untuk nilai yang tidak valid", () => {
    expect(unlockTimeHint(undefined)).toBe("");
    expect(unlockTimeHint("bukan tanggal")).toBe("");
  });

  it("menyebut jam buka", () => {
    expect(unlockTimeHint(new Date(NOW).toISOString())).toMatch(/^ Bisa dicoba lagi pukul \d{2}[.:]\d{2}\.$/);
  });
});
