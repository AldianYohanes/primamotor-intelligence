import { describe, expect, it } from "vitest";
import {
  calculateDeadStock,
  shouldCreateDeadStockNotification,
} from "./dead-stock";

const NOW = new Date("2026-11-08T00:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe("calculateDeadStock", () => {
  it("menandai produk bersisa stok yang terakhir keluar lebih dari 365 hari lalu", () => {
    const result = calculateDeadStock({
      totalAvailable: 5,
      lastOutboundAt: daysAgo(400),
      productCreatedAt: daysAgo(800),
      now: NOW,
    });
    expect(result.idleDays).toBe(400);
    expect(result.isCandidate).toBe(true);
  });

  it("batasnya lebih dari D_dead: tepat 365 hari belum kandidat, 366 sudah", () => {
    const base = { totalAvailable: 5, productCreatedAt: daysAgo(900), now: NOW };
    expect(
      calculateDeadStock({ ...base, lastOutboundAt: daysAgo(365) }).isCandidate,
    ).toBe(false);
    expect(
      calculateDeadStock({ ...base, lastOutboundAt: daysAgo(366) }).isCandidate,
    ).toBe(true);
  });

  it("tidak menandai produk tanpa stok", () => {
    const result = calculateDeadStock({
      totalAvailable: 0,
      lastOutboundAt: daysAgo(900),
      productCreatedAt: daysAgo(1000),
      now: NOW,
    });
    expect(result.isCandidate).toBe(false);
  });

  it("tanpa transaksi keluar, selang dihitung sejak produk dibuat", () => {
    const old = calculateDeadStock({
      totalAvailable: 3,
      lastOutboundAt: null,
      productCreatedAt: daysAgo(400),
      now: NOW,
    });
    const fresh = calculateDeadStock({
      totalAvailable: 3,
      lastOutboundAt: null,
      productCreatedAt: daysAgo(10),
      now: NOW,
    });
    expect(old.isCandidate).toBe(true);
    expect(fresh.isCandidate).toBe(false);
  });

  it("tanggal tak terbaca tidak pernah menjadi kandidat", () => {
    const result = calculateDeadStock({
      totalAvailable: 5,
      lastOutboundAt: "bukan tanggal",
      productCreatedAt: daysAgo(900),
      now: NOW,
    });
    expect(result.idleDays).toBe(0);
    expect(result.isCandidate).toBe(false);
  });

  it("tanggal di masa depan tidak menghasilkan selang negatif", () => {
    const result = calculateDeadStock({
      totalAvailable: 5,
      lastOutboundAt: daysAgo(-3),
      productCreatedAt: daysAgo(900),
      now: NOW,
    });
    expect(result.idleDays).toBe(0);
  });

  it("batas dapat diganti lewat deadDays", () => {
    const result = calculateDeadStock({
      totalAvailable: 5,
      lastOutboundAt: daysAgo(200),
      productCreatedAt: daysAgo(900),
      now: NOW,
      deadDays: 180,
    });
    expect(result.deadDays).toBe(180);
    expect(result.isCandidate).toBe(true);
  });
});

describe("shouldCreateDeadStockNotification", () => {
  it("tidak mengulang notifikasi yang masih baru", () => {
    const calculation = calculateDeadStock({
      totalAvailable: 5,
      lastOutboundAt: daysAgo(400),
      productCreatedAt: daysAgo(800),
      now: NOW,
    });
    expect(shouldCreateDeadStockNotification(calculation, true)).toBe(false);
    expect(shouldCreateDeadStockNotification(calculation, false)).toBe(true);
  });

  it("bukan kandidat tidak pernah membuat notifikasi", () => {
    const calculation = calculateDeadStock({
      totalAvailable: 0,
      lastOutboundAt: daysAgo(400),
      productCreatedAt: daysAgo(800),
      now: NOW,
    });
    expect(shouldCreateDeadStockNotification(calculation, false)).toBe(false);
  });
});
