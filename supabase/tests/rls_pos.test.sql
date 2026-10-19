-- rls_pos.test.sql
-- Tes tambahan untuk RLS tabel `sales`/`sale_items` (migration 0025_pos_sales.sql).
-- Gabungkan ke supabase/tests/rls.test.sql yang sudah ada (progres 9→19 di sana) —
-- dipisah ke file sendiri di sini supaya gampang direview dulu sebelum digabung,
-- silakan pindahkan isi `begin`..`select plan(...)` ke file rls.test.sql utama
-- sesuai penomoran test yang sudah berjalan di sana.
--
-- Asumsi: memakai pgTAP, dua tenant (business A & B) dan staf contoh sudah
-- di-seed sebelum blok ini (lihat pola test yang sudah ada).

begin;
select plan(6);

-- 1. Staf tenant A tidak bisa melihat sales milik tenant B
select is(
  (select count(*)::int from sales where business_id = '<business_b_id>'),
  0,
  'Staf tenant A tidak bisa membaca sales tenant B (RLS select)'
);

-- 2. Staf tenant A bisa melihat sales miliknya sendiri
select isnt(
  (select count(*)::int from sales where business_id = '<business_a_id>'),
  0,
  'Staf tenant A bisa membaca sales miliknya sendiri'
);

-- 3. Staf role 'staff' (bukan is_full_access) tidak bisa INSERT langsung ke sales
--    lewat client biasa (mutasi sesungguhnya lewat admin client + RPC record_sale,
--    RLS ini backstop kalau ada yang coba .insert() langsung dari browser)
select throws_ok(
  $$ insert into sales (business_id, location_id, payment_method) values ('<business_a_id>', '<location_id>', 'cash') $$,
  'new row violates row-level security policy for table "sales"',
  'Role staff biasa tidak bisa INSERT langsung ke sales (harus lewat record_sale RPC)'
);

-- 4. sale_items ikut ter-filter tenant sesuai business_id yang didenormalisasi
select is(
  (select count(*)::int from sale_items where business_id = '<business_b_id>'),
  0,
  'Staf tenant A tidak bisa membaca sale_items tenant B (RLS select)'
);

-- 5. super_admin bisa membaca sales lintas tenant
select isnt(
  (select count(*)::int from sales),
  0,
  'super_admin bisa membaca sales lintas tenant'
);

-- 6. Tidak ada policy UPDATE/DELETE untuk sale_items (immutable, lihat komentar migration)
select throws_ok(
  $$ update sale_items set quantity = 999 where business_id = '<business_a_id>' $$,
  'new row violates row-level security policy for table "sale_items"',
  'sale_items tidak bisa diedit langsung — immutable, void_sale menambah baris baru, bukan mengubah yang lama'
);

select * from finish();
rollback;
