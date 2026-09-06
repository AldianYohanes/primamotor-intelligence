export const REORDER_OBSERVATION_DAYS = 90;
export const REORDER_TARGET_DAYS = 45;

export interface ReorderCalculationInput {
  totalOutbound: number;
  totalAvailable: number;
  minThreshold: number;
  leadTimeDays: number;
  safetyStock: number;
  observationDays?: number;
  targetDays?: number;
}

export interface ReorderCalculation {
  observationDays: number;
  targetDays: number;
  totalOutbound: number;
  averageDailyOutbound: number;
  reorderPoint: number;
  effectiveThreshold: number;
  targetStock: number;
  totalAvailable: number;
  shouldReorder: boolean;
  suggestedQuantity: number;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

export function calculateReorder(
  input: ReorderCalculationInput,
): ReorderCalculation {
  const observationDays = Math.max(
    Math.trunc(input.observationDays ?? REORDER_OBSERVATION_DAYS),
    1,
  );
  const targetDays = Math.max(
    Math.trunc(input.targetDays ?? REORDER_TARGET_DAYS),
    1,
  );
  const totalOutbound = nonNegative(input.totalOutbound);
  const totalAvailable = nonNegative(input.totalAvailable);
  const minThreshold = nonNegative(input.minThreshold);
  const leadTimeDays = nonNegative(input.leadTimeDays);
  const safetyStock = nonNegative(input.safetyStock);

  const averageDailyOutbound = totalOutbound / observationDays;
  const reorderPoint = Math.ceil(
    averageDailyOutbound * leadTimeDays + safetyStock,
  );
  const effectiveThreshold = Math.max(reorderPoint, minThreshold);
  const targetStock = Math.max(
    effectiveThreshold,
    Math.ceil(averageDailyOutbound * targetDays),
  );

  // Semua parameter produk lama bernilai 0 secara default. Guard ini mencegah
  // produk tanpa konfigurasi dan tanpa permintaan menghasilkan saran 1 unit.
  const shouldReorder =
    effectiveThreshold > 0 && totalAvailable <= effectiveThreshold;
  const suggestedQuantity = shouldReorder
    ? Math.max(targetStock - totalAvailable, 1)
    : 0;

  return {
    observationDays,
    targetDays,
    totalOutbound,
    averageDailyOutbound,
    reorderPoint,
    effectiveThreshold,
    targetStock,
    totalAvailable,
    shouldReorder,
    suggestedQuantity,
  };
}

export function shouldCreateReorderSuggestion(
  calculation: ReorderCalculation,
  hasPendingSuggestion: boolean,
): boolean {
  return calculation.shouldReorder && !hasPendingSuggestion;
}
