/**
 * Bikin SQL dari ekspor JSON /eval: mengulang semua perubahan stok yang dikonfirmasi selama run,
 * supaya DB bisa disamakan dengan keadaan saat run berhenti (mis. sebelum lanjut di tempat lain).
 *
 *   bun scripts/eval-run-to-sql.ts <hasil.json> [keluaran.sql]
 *
 * Urutan pakai: reset data (tombol "Reset data eval" atau supabase/seed_eval.sql) -> jalankan SQL hasil skrip
 * di SQL editor -> impor JSON yang sama di /eval -> lanjutkan run.
 * Catatan: baris agent_audit_log asli tidak dibuat ulang; yang diulang hanya perubahan stok.
 */
import { readFileSync, writeFileSync } from "node:fs";

const BUSINESS_ID = "e0000000-0000-0000-0000-00000000e001";
const STAFF = `(select id from staff where business_id = '${BUSINESS_ID}' order by (username = 'owner') desc, username limit 1)`;

type Trace = {
  name: string;
  result?: { audit_log_id?: string };
  executedArgs?: Record<string, string | number>;
};
type Row = { observation: { confirmOutcome?: string; toolTrace?: Trace[]; stockAfter?: Record<string, number> } };

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error("Pakai: bun scripts/eval-run-to-sql.ts <hasil.json> [keluaran.sql]");
  process.exit(1);
}

const q = (v: unknown) => `'${String(v).replace(/'/g, "''")}'`;
const run = JSON.parse(readFileSync(input, "utf8")) as { rows: Row[] };

const statements: string[] = [];
for (const { observation: o } of run.rows) {
  if (o.confirmOutcome !== "confirmed") continue;
  for (const t of o.toolTrace ?? []) {
    const a = t.executedArgs;
    const key = t.result?.audit_log_id;
    if (!a || !key) throw new Error(`Jejak ${t.name} tanpa executedArgs atau audit_log_id`);
    if (t.name === "updateStock") {
      statements.push(
        `select record_stock_transaction(p_business_id => '${BUSINESS_ID}', p_product_id => ${q(a.product_id)}, p_location_id => ${q(a.location_id)}, p_type => ${q(a.direction)}::transaction_type, p_quantity => ${Number(a.quantity)}, p_staff_id => ${STAFF}, p_idempotency_key => ${q(key)});`,
      );
    } else if (t.name === "transferStock") {
      statements.push(
        `select transfer_stock(p_business_id => '${BUSINESS_ID}', p_product_id => ${q(a.product_id)}, p_quantity => ${Number(a.quantity)}, p_from_location_id => ${q(a.from_location_id)}, p_to_location_id => ${q(a.to_location_id)}, p_staff_id => ${STAFF}, p_idempotency_key => ${q(key)});`,
      );
    } else {
      throw new Error(`Tool tidak dikenal: ${t.name}`);
    }
  }
}

// Stok yang diharapkan = snapshot stockAfter terakhir di berkas (kunci "produk:lokasi").
const expected = [...run.rows].reverse().find((r) => r.observation.stockAfter)?.observation.stockAfter ?? {};
const expectedValues = Object.entries(expected).map(([k, qty]) => {
  const [p, l] = k.split(":");
  return `(${q(p)}::uuid, ${q(l)}::uuid, ${Number(qty)})`;
});

const sql = [
  `-- Dibuat oleh scripts/eval-run-to-sql.ts dari ${input}`,
  `-- ${statements.length} perubahan stok dikonfirmasi diulang sesuai urutan run.`,
  `-- Jalankan SETELAH data eval direset (tombol "Reset data eval" atau supabase/seed_eval.sql).`,
  "",
  "begin;",
  ...statements,
  "commit;",
  "",
  "-- Cek: harus 0 baris. Selisih berarti DB belum sama dengan akhir run.",
  `with expected(product_id, location_id, qty) as (values ${expectedValues.join(", ")})`,
  "select e.product_id, e.location_id, e.qty as seharusnya, coalesce(s.quantity, 0) as sekarang",
  "from expected e left join stock s on s.product_id = e.product_id and s.location_id = e.location_id",
  "where coalesce(s.quantity, 0) <> e.qty;",
  "",
].join("\n");

if (output) writeFileSync(output, sql);
else process.stdout.write(sql);
console.error(`${statements.length} pernyataan stok, ${expectedValues.length} baris cek.`);
