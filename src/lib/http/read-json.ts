/**
 * Body JSON yang rusak atau kosong menjadi null, bukan melempar galat. Skema Zod menolak null
 * sebagai "Input tidak valid" (400), jadi klien mendapat 400 alih-alih 500.
 */
export function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}
