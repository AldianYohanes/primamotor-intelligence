import { describe, expect, it } from "vitest";
import {
  calculateReorder,
  shouldCreateReorderSuggestion,
} from "./reorder-calculation";

describe("calculateReorder", () => {
  it("menghasilkan contoh Filter Oli pada naskah", () => {
    const result = calculateReorder({
      totalOutbound: 30,
      totalAvailable: 7,
      minThreshold: 5,
      leadTimeDays: 14,
      safetyStock: 4,
    });

    expect(result.averageDailyOutbound).toBeCloseTo(0.333333, 5);
    expect(result.reorderPoint).toBe(9);
    expect(result.effectiveThreshold).toBe(9);
    expect(result.targetStock).toBe(15);
    expect(result.shouldReorder).toBe(true);
    expect(result.suggestedQuantity).toBe(8);
  });

  it("memicu restock ketika stok tepat sama dengan ROP", () => {
    const result = calculateReorder({
      totalOutbound: 18,
      totalAvailable: 5,
      minThreshold: 2,
      leadTimeDays: 15,
      safetyStock: 2,
    });
    expect(result.reorderPoint).toBe(5);
    expect(result.shouldReorder).toBe(true);
  });

  it("memakai min_threshold ketika lebih tinggi daripada ROP", () => {
    const result = calculateReorder({
      totalOutbound: 0,
      totalAvailable: 3,
      minThreshold: 4,
      leadTimeDays: 14,
      safetyStock: 1,
    });
    expect(result.reorderPoint).toBe(1);
    expect(result.effectiveThreshold).toBe(4);
    expect(result.suggestedQuantity).toBe(1);
  });

  it("memakai ROP ketika lebih tinggi daripada min_threshold", () => {
    const result = calculateReorder({
      totalOutbound: 45,
      totalAvailable: 10,
      minThreshold: 3,
      leadTimeDays: 21,
      safetyStock: 4,
    });
    expect(result.reorderPoint).toBe(15);
    expect(result.effectiveThreshold).toBe(15);
  });

  it("tidak membuat saran untuk produk lama yang seluruh konfigurasinya nol", () => {
    const result = calculateReorder({
      totalOutbound: 0,
      totalAvailable: 0,
      minThreshold: 0,
      leadTimeDays: 0,
      safetyStock: 0,
    });
    expect(result.shouldReorder).toBe(false);
    expect(result.suggestedQuantity).toBe(0);
  });

  it("lead time nol tetap mempertahankan safety stock sebagai ROP", () => {
    const result = calculateReorder({
      totalOutbound: 30,
      totalAvailable: 2,
      minThreshold: 0,
      leadTimeDays: 0,
      safetyStock: 3,
    });
    expect(result.reorderPoint).toBe(3);
    expect(result.shouldReorder).toBe(true);
  });
});

describe("shouldCreateReorderSuggestion", () => {
  it("mencegah rekomendasi pending ganda", () => {
    const calculation = calculateReorder({
      totalOutbound: 30,
      totalAvailable: 7,
      minThreshold: 5,
      leadTimeDays: 14,
      safetyStock: 4,
    });
    expect(shouldCreateReorderSuggestion(calculation, true)).toBe(false);
    expect(shouldCreateReorderSuggestion(calculation, false)).toBe(true);
  });
});
