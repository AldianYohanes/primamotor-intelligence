import { vi } from "vitest";

export interface MockResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

/**
 * Query builder chainable mock — setiap method rantai (select/eq/order/range/
 * update/insert/delete) balik `this` lewat vi.fn() supaya call args-nya bisa
 * di-assert (mis. `.eq('business_id', ...)` beneran dipanggil dengan tenant
 * yang benar — ini yang bikin test jadi bukti §15.1/§10, bukan cuma smoke
 * test), sampai chain di-`await` LANGSUNG (lewat `.then`, meniru query builder
 * Supabase yang thenable) ATAU dipanggil `.single()`/`.maybeSingle()` —
 * ketiganya resolve ke `result` yang sama persis.
 *
 * SENGAJA SEDERHANA: satu builder = satu hasil akhir TETAP, tidak
 * mensimulasikan filter/query sungguhan (`.eq('id', 'x')` tidak benar-benar
 * menyaring apapun di sini). Cukup untuk unit test LOGIKA Route Handler
 * (skenario error/sukses, guard role, urutan pemanggilan tabel) — BUKAN
 * pengganti test RLS/integrasi DB sungguhan, itu peran `rls.test.sql`
 * (§15.4 lainnya, jalan lawan Postgres asli).
 */
export function createMockQueryBuilder(result: MockResult) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    like: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (
      resolve: (value: MockResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/**
 * Mock client pengganti hasil `createClient()`/`createAdminClient()`.
 *
 * `from[table]` adalah ANTREAN (array) builder per nama tabel — supaya Route
 * Handler yang panggil `.from(table)` LEBIH DARI SEKALI ke tabel yang sama
 * dalam satu request (mis. PATCH produk: delete lalu insert ke
 * `product_aliases`) dapat hasil berbeda tiap panggilan sesuai urutan yang
 * didaftarkan di test. Kalau antrean tabel itu habis, panggilan berikutnya
 * dapat builder TERAKHIR yang terdaftar (fallback berulang), bukan error —
 * cukup untuk kasus umum "hasil sama untuk semua panggilan ke tabel ini".
 */
export function createMockSupabase(config: {
  user?: { id: string } | null;
  from?: Record<string, MockResult[]>;
}) {
  const cursors: Record<string, number> = {};
  const fromMock = vi.fn((table: string) => {
    const queue = config.from?.[table] ?? [];
    const idx = cursors[table] ?? 0;
    cursors[table] = idx + 1;
    const result = queue[idx] ??
      queue[queue.length - 1] ?? { data: null, error: null };
    return createMockQueryBuilder(result);
  });

  return {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: config.user ?? null } }),
      ),
    },
    from: fromMock,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
}
