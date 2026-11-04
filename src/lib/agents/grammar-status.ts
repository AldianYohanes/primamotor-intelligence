/**
 * Status grammar (response_format) WebLLM untuk seluruh agent. Bila build WebLLM menolak grammar,
 * semua panggilan jatuh ke mode bebas; tanpa jejak, hasil eval berubah tanpa terlihat.
 * Dicatat ke konsol dan ke setiap eksekusi /eval (field grammarUnavailable).
 */
let unavailable = false;

export function isGrammarUnavailable(): boolean {
  return unavailable;
}

export function markGrammarUnavailable(source: string, err: unknown): void {
  unavailable = true;
  console.warn(`[grammar] ${source}: WebLLM menolak grammar, memakai mode bebas.`, err);
}
