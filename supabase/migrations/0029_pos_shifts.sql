-- 0029_pos_shifts.sql
--
-- Shift kasir untuk rekonsiliasi kas (X report = cek tengah shift tanpa
-- tutup, Z report = tutup shift & kunci angkanya). SENGAJA additive, bukan
-- prasyarat checkout — POS tetap bisa dipakai tanpa shift terbuka (checkout
-- di record_sale, migration 0025-0027, TIDAK diubah/tidak butuh shift_id).
-- Ini murni alat rekonsiliasi kas opsional, bukan penjaga transaksi. Kalau
-- nanti toko mau mewajibkan shift sebelum checkout, itu perubahan terpisah
-- (tambah p_shift_id ke record_sale + validasi wajib ada shift terbuka).
--
-- Laporan dihitung dari rentang waktu shift (opened_at..closed_at/now())
-- terhadap sales+sale_payments yang SUDAH ADA, bukan lewat kolom shift_id di
-- sales — lebih sederhana & tidak perlu mengubah RPC record_sale yang sudah
-- teruji. Konsekuensinya: kalau staf yang sama buka DUA shift berurutan di
-- lokasi berbeda dalam waktu tumpang tindih (harusnya tidak mungkin karena
-- unique index di bawah), atau kalau nota di-void di shift yang BEDA dari
-- shift saat nota dibuat, rekonsiliasi kas bisa sedikit meleset — batasan
-- yang wajar untuk pendekatan berbasis rentang waktu, didokumentasikan di
-- README, bukan bug tersembunyi.

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  location_id uuid not null references locations(id),
  staff_id uuid not null references staff(id),
  opening_cash numeric not null default 0,
  closing_cash numeric,
  expected_cash numeric,
  cash_variance numeric,
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

-- Satu staf tidak boleh punya dua shift terbuka sekaligus DI LOKASI YANG SAMA
-- — dicegah di level DB (bukan cuma dicek di Route Handler) supaya race
-- condition dua klik cepat "Buka Shift" tidak menghasilkan dua baris terbuka.
create unique index if not exists shifts_one_open_per_staff_location
  on shifts (staff_id, location_id)
  where status = 'open';

create index if not exists shifts_business_idx on shifts (business_id, opened_at desc);

alter table shifts enable row level security;
create policy shifts_select on shifts for select using (business_id = auth_business_id() or is_super_admin());
-- Insert/update lewat is_full_access() sebagai backstop (§10) — otorisasi
-- SESUNGGUHNYA (staf boleh buka/tutup shift MILIK SENDIRI, admin/owner boleh
-- untuk siapa saja) ditegakkan di Route Handler yang selalu pakai admin
-- client setelah requireStaff(), pola yang sama seperti sales/customers.
create policy shifts_insert on shifts for insert with check (business_id = auth_business_id() and is_full_access());
create policy shifts_update on shifts for update
  using (business_id = auth_business_id() and is_full_access())
  with check (business_id = auth_business_id() and is_full_access());
