-- supabase/tests/rls.test.sql
--
-- Cara jalankan (butuh instance lokal via `supabase start`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
--
-- Pola: simulasikan identitas lewat `set local role authenticated` +
-- `set local request.jwt.claim.sub = '<uuid staf>'` (ini persis cara auth.uid()
-- Supabase membaca identitas di balik layar, lihat definisi auth.uid()).
-- Setiap skenario dibungkus DO block yang RAISE EXCEPTION kalau assert gagal,
-- supaya psql keluar dengan exit code != 0 saat ada test yang merah (bisa dipasang di CI).
--
-- Test "harus ditolak" menyimpan SQLSTATE lalu assert DI LUAR blok exception.
-- Jangan taruh RAISE 'FAIL' di dalam blok yang punya `when others`: FAIL-nya
-- ikut tertangkap dan tercetak PASS. 42501 = insufficient_privilege (RLS/grant);
-- error lain (UUID salah, NOT NULL, dst) sengaja dianggap FAIL.

begin;

-- ============================================================
-- FIXTURES: 2 tenant terpisah + berbagai role, TANPA lewat RLS
-- (dijalankan sebagai superuser/table owner sebelum test mulai)
-- ============================================================

insert into businesses (id, name, slug, status) values
  ('11111111-1111-1111-1111-111111111111', 'Toko A', 'toko-a', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Toko B', 'toko-b', 'active');

-- auth.users minimal (kolom wajib disesuaikan skema auth Supabase versi terbaru;
-- kalau gagal karena kolom NOT NULL tambahan, tambahkan default yang sesuai)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'toko-a.staff@staff.internal'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'toko-a.owner@staff.internal'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'toko-b.staff@staff.internal'),
  ('cccccccc-0000-0000-0000-000000000001', 'admin.dev@staff.internal');

insert into staff (id, business_id, auth_user_id, username, full_name, role) values
  ('11111111-aaaa-1111-aaaa-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff', 'Staf Toko A', 'staff'),
  ('11111111-bbbb-1111-bbbb-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'owner', 'Owner Toko A', 'owner'),
  ('22222222-aaaa-2222-aaaa-222222222222', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'staff', 'Staf Toko B', 'staff'),
  ('33333333-aaaa-3333-aaaa-333333333333', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'admin', 'Admin Dev', 'admin');

insert into products (id, business_id, name) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Radiator 240'),
  ('b2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Karburator 740');

insert into locations (id, business_id, name, type) values
  ('11111111-0ca0-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Toko', 'toko'),
  ('22222222-0ca0-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Gudang B', 'gudang');

-- car_models tanpa business_id (referensi lintas tenant, §3.0/§10) — insert
-- sebagai superuser (bypass RLS), sama seperti fixture lain di atas.
insert into car_models (id, brand, name, era_group, year_start, year_end) values
  ('cccccccc-cccc-cccc-cccc-000000000001', 'Volvo', '240 Test Fixture', 'boxy', 1974, 1993);

insert into reorder_suggestions (id, business_id, product_id, suggested_quantity, status) values
  ('dddddddd-dddd-dddd-dddd-000000000001', '11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 5, 'pending'),
  ('eeeeeeee-eeee-eeee-eeee-000000000001', '22222222-2222-2222-2222-222222222222', 'b2222222-0000-0000-0000-000000000001', 3, 'pending');

-- ============================================================
-- TEST 1: staf Toko A tidak boleh melihat produk Toko B (isolasi tenant)
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

  select count(*) into visible_count from products where business_id = '22222222-2222-2222-2222-222222222222';

  if visible_count != 0 then
    raise exception 'FAIL test 1: staf Toko A bisa lihat % produk milik Toko B (harusnya 0)', visible_count;
  end if;
  raise notice 'PASS test 1: isolasi tenant produk';
end $$;

-- ============================================================
-- TEST 2: staf Toko A TETAP bisa lihat produk Toko A sendiri
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

  select count(*) into visible_count from products where business_id = '11111111-1111-1111-1111-111111111111';

  if visible_count != 1 then
    raise exception 'FAIL test 2: staf Toko A harusnya lihat 1 produk milik sendiri, terlihat %', visible_count;
  end if;
  raise notice 'PASS test 2: staf bisa baca data tenant sendiri';
end $$;

-- ============================================================
-- TEST 3: role 'staff' (bukan owner/admin) TIDAK boleh insert produk
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- role staff

  begin
    insert into products (business_id, name) values ('11111111-1111-1111-1111-111111111111', 'Produk Ilegal');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 3: staf role "staff" insert produk tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 3: role staff ditolak insert produk';
end $$;

-- ============================================================
-- TEST 4: role 'owner' BOLEH insert produk di tenant sendiri
-- ============================================================
do $$
declare
  new_id uuid;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002'; -- role owner

  insert into products (business_id, name) values ('11111111-1111-1111-1111-111111111111', 'Produk Sah Owner')
    returning id into new_id;

  if new_id is null then
    raise exception 'FAIL test 4: owner gagal insert produk di tenant sendiri';
  end if;
  raise notice 'PASS test 4: owner bisa insert produk di tenant sendiri';
end $$;

-- ============================================================
-- TEST 5: owner Toko A TIDAK boleh insert produk ke Toko B
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002'; -- owner Toko A

  begin
    insert into products (business_id, name) values ('22222222-2222-2222-2222-222222222222', 'Produk Nyelonong ke Toko B');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 5: owner Toko A insert produk ke Toko B tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 5: owner tidak bisa insert lintas tenant';
end $$;

-- ============================================================
-- TEST 6: staf (authenticated, bukan service_role) TIDAK boleh insert
-- langsung ke stock_transactions — harus lewat RPC record_stock_transaction
-- yang dipanggil dari server dengan service role
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002'; -- owner Toko A

  begin
    insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity)
    values ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', '11111111-0ca0-0000-0000-000000000001', 'masuk', 10);
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 6: insert langsung ke stock_transactions tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 6: insert langsung ke ledger ditolak untuk non-service_role';
end $$;

-- ============================================================
-- TEST 7: ledger append-only — bahkan service_role/owner TIDAK BOLEH
-- update/delete baris stock_transactions yang sudah ada (tidak ada policy
-- update/delete sama sekali di 0019_rls_policies.sql)
-- ============================================================
do $$
declare
  txn_id uuid;
begin
  -- insert 1 baris ledger sebagai service_role dulu (jalur yang sah). Di Supabase,
  -- role Postgres `service_role` dibuat dengan atribut BYPASSRLS, jadi baris ini
  -- lolos terlepas dari isi policy `auth.role() = 'service_role'` di migration —
  -- itu berlaku sebagai dokumentasi/defense-in-depth, bukan mekanisme utama.
  set local role service_role;
  insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity)
  values ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', '11111111-0ca0-0000-0000-000000000001', 'masuk', 5)
  returning id into txn_id;

  -- coba update sebagai owner tenant yang sama
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

  begin
    update stock_transactions set quantity = 999 where id = txn_id;
    -- update ke 0 baris tidak error di Postgres, jadi kita cek row count, bukan exception
    if found then
      raise exception 'FAIL test 7: ledger stock_transactions berhasil di-UPDATE (harusnya append-only)';
    end if;
    raise notice 'PASS test 7: ledger append-only (update 0 baris karena tidak ada policy update)';
  end;
end $$;

-- ============================================================
-- TEST 8: is_super_admin() (role 'admin') bisa lihat SEMUA tenant
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000001'; -- admin

  select count(*) into visible_count from businesses;

  if visible_count < 2 then
    raise exception 'FAIL test 8: admin (super_admin) tidak bisa lihat semua tenant (hanya lihat %)', visible_count;
  end if;
  raise notice 'PASS test 8: super_admin bisa lihat lintas tenant';
end $$;

-- ============================================================
-- TEST 9: staff_employment (data gaji) — lebih ketat, staf biasa TIDAK
-- boleh baca sama sekali meski di tenant sendiri
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role service_role; -- BYPASSRLS, jalur insert data gaji yang sah (server-side)
  insert into staff_employment (staff_id, business_id, base_salary)
  values ('11111111-aaaa-1111-aaaa-111111111111', '11111111-1111-1111-1111-111111111111', 5000000);

  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- role staff, BUKAN owner

  select count(*) into visible_count from staff_employment where business_id = '11111111-1111-1111-1111-111111111111';

  if visible_count != 0 then
    raise exception 'FAIL test 9: staf biasa bisa baca staff_employment (data gaji) — harusnya 0 baris terlihat';
  end if;
  raise notice 'PASS test 9: staff_employment tidak bisa dibaca role staff biasa';
end $$;

-- ============================================================
-- TEST 10: locations — isolasi tenant (staf Toko A tidak lihat lokasi Toko B)
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- staf Toko A

  select count(*) into visible_count from locations where business_id = '22222222-2222-2222-2222-222222222222';

  if visible_count != 0 then
    raise exception 'FAIL test 10: staf Toko A bisa lihat % lokasi milik Toko B (harusnya 0)', visible_count;
  end if;
  raise notice 'PASS test 10: isolasi tenant lokasi';
end $$;

-- ============================================================
-- TEST 11: locations — role 'staff' tidak boleh insert, role 'owner' boleh
-- (pola sama seperti products, RLS "locations write full_access")
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- role staff

  begin
    insert into locations (business_id, name, type) values ('11111111-1111-1111-1111-111111111111', 'Gudang Ilegal', 'gudang');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 11a: staf role "staff" insert lokasi tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 11a: role staff ditolak insert lokasi';
end $$;

do $$
declare
  new_id uuid;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002'; -- role owner

  insert into locations (business_id, name, type) values ('11111111-1111-1111-1111-111111111111', 'Gudang Sah Owner', 'gudang')
    returning id into new_id;

  if new_id is null then
    raise exception 'FAIL test 11b: owner gagal insert lokasi di tenant sendiri';
  end if;
  raise notice 'PASS test 11b: owner bisa insert lokasi di tenant sendiri';
end $$;

-- ============================================================
-- TEST 12: car_models — dibaca SEMUA staf authenticated (referensi bersama,
-- bukan per-tenant), tapi tulis cuma boleh super_admin
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- role staff biasa, tenant mana pun

  select count(*) into visible_count from car_models where id = 'cccccccc-cccc-cccc-cccc-000000000001';

  if visible_count != 1 then
    raise exception 'FAIL test 12a: staf biasa tidak bisa baca car_models (referensi bersama harusnya kebaca semua)';
  end if;
  raise notice 'PASS test 12a: car_models kebaca semua staf authenticated';
end $$;

do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002'; -- owner, BUKAN super_admin

  begin
    insert into car_models (brand, name) values ('Volvo', 'Model Ilegal dari Owner');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 12b: owner (bukan super_admin) insert car_models tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 12b: owner ditolak tulis car_models (cuma super_admin yang boleh)';
end $$;

do $$
declare
  new_id uuid;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000001'; -- admin (super_admin)

  insert into car_models (brand, name) values ('Volvo', '740 Test Fixture dari Admin') returning id into new_id;

  if new_id is null then
    raise exception 'FAIL test 12c: super_admin gagal insert car_models';
  end if;
  raise notice 'PASS test 12c: super_admin bisa insert car_models';
end $$;

-- ============================================================
-- TEST 13: reorder_suggestions — acknowledge/dismiss (PATCH baru di §12 iterasi
-- ini) cuma boleh full_access, dan tetap terikat isolasi tenant
-- ============================================================
do $$
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- role staff, BUKAN full_access

  update reorder_suggestions set status = 'acknowledged', acknowledged_by = '11111111-aaaa-1111-aaaa-111111111111'
    where id = 'dddddddd-dddd-dddd-dddd-000000000001';

  if found then
    raise exception 'FAIL test 13a: staf role "staff" berhasil update reorder_suggestions (harusnya cuma full_access)';
  end if;
  raise notice 'PASS test 13a: role staff ditolak acknowledge saran restock (0 baris ter-update)';
end $$;

do $$
declare
  updated_status text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002'; -- owner Toko A, full_access

  update reorder_suggestions set status = 'acknowledged', acknowledged_by = '11111111-bbbb-1111-bbbb-111111111111'
    where id = 'dddddddd-dddd-dddd-dddd-000000000001'
    returning status into updated_status;

  if updated_status is distinct from 'acknowledged' then
    raise exception 'FAIL test 13b: owner gagal acknowledge saran restock di tenant sendiri';
  end if;
  raise notice 'PASS test 13b: owner bisa acknowledge saran restock di tenant sendiri';

  -- owner Toko A TIDAK boleh sentuh saran milik Toko B (isolasi tenant tetap berlaku)
  update reorder_suggestions set status = 'dismissed' where id = 'eeeeeeee-eeee-eeee-eeee-000000000001';
  if found then
    raise exception 'FAIL test 13c: owner Toko A berhasil update saran restock milik Toko B (harusnya ditolak)';
  end if;
  raise notice 'PASS test 13c: isolasi tenant tetap berlaku untuk update reorder_suggestions';
end $$;

-- ============================================================
-- TEST 14: increment_ocr_rate_limit RPC (0022_ocr_rate_limit.sql) — increment
-- atomik, limit ditegakkan, DAN terisolasi per business_id (bukan cuma per fungsi)
-- ============================================================
do $$
declare
  r1 record;
  r2 record;
  r3 record;
  r_other_tenant record;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- staf Toko A

  select * into r1 from increment_ocr_rate_limit('11111111-1111-1111-1111-111111111111', 60, 2);
  select * into r2 from increment_ocr_rate_limit('11111111-1111-1111-1111-111111111111', 60, 2);
  select * into r3 from increment_ocr_rate_limit('11111111-1111-1111-1111-111111111111', 60, 2);

  if not (r1.allowed and r1.current_count = 1) then
    raise exception 'FAIL test 14a: panggilan pertama harusnya allowed=true, current_count=1 (dapat allowed=%, count=%)', r1.allowed, r1.current_count;
  end if;
  if not (r2.allowed and r2.current_count = 2) then
    raise exception 'FAIL test 14b: panggilan kedua harusnya allowed=true, current_count=2 (dapat allowed=%, count=%)', r2.allowed, r2.current_count;
  end if;
  if r3.allowed or r3.current_count != 3 then
    raise exception 'FAIL test 14c: panggilan ketiga (melebihi limit 2) harusnya allowed=false, current_count tetap naik jadi 3 (dapat allowed=%, count=%)', r3.allowed, r3.current_count;
  end if;
  raise notice 'PASS test 14a-c: increment_ocr_rate_limit atomik & menegakkan limit dalam satu window';

  -- Toko B (business_id beda) harus punya counter TERPISAH, tidak ikut kena
  -- limit yang sudah dipakai habis Toko A di window yang sama.
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001'; -- staf Toko B
  select * into r_other_tenant from increment_ocr_rate_limit('22222222-2222-2222-2222-222222222222', 60, 2);

  if not (r_other_tenant.allowed and r_other_tenant.current_count = 1) then
    raise exception 'FAIL test 14d: counter rate limit Toko B harusnya independen dari Toko A (dapat allowed=%, count=%)', r_other_tenant.allowed, r_other_tenant.current_count;
  end if;
  raise notice 'PASS test 14d: rate limit OCR terisolasi per tenant';
end $$;

-- ============================================================
-- TEST 15: sales (migration 0025) — tenant isolation di select, DAN insert
-- langsung oleh role 'staff' (bukan owner/admin) ditolak RLS (`sales_insert`
-- butuh is_full_access()) — checkout staf biasa cuma bisa lewat RPC
-- record_sale() yang security definer, BUKAN insert langsung dari client
-- manapun (§7: "eksekusi tool selalu lewat Route Handler sendiri").
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- staf Toko A

  select count(*) into visible_count from sales where business_id = '22222222-2222-2222-2222-222222222222';

  if visible_count != 0 then
    raise exception 'FAIL test 15a: staf Toko A bisa lihat % sales milik Toko B (harusnya 0)', visible_count;
  end if;
  raise notice 'PASS test 15a: isolasi tenant sales';
end $$;

do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- role staff, BUKAN full_access

  begin
    insert into sales (business_id, location_id, staff_id, subtotal, total_amount, payment_method, amount_paid)
    values ('11111111-1111-1111-1111-111111111111', '11111111-0ca0-0000-0000-000000000001', '11111111-aaaa-1111-aaaa-111111111111', 50000, 50000, 'cash', 50000);
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 15b: insert langsung ke sales oleh role staff tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 15b: insert langsung ke sales ditolak untuk role staff (RLS backstop di belakang RPC)';
end $$;

-- ============================================================
-- TEST 16: shifts (migration 0029) — tenant isolation, DAN insert langsung
-- oleh role 'staff' ditolak RLS meski itu shift MILIK STAF SENDIRI —
-- konsisten dengan komentar migration 0029: otorisasi "boleh buka shift
-- sendiri" ditegakkan di Route Handler (admin client setelah requireStaff()),
-- RLS di sini murni backstop is_full_access(), bukan pengecualian utk staf
-- yang insert shift miliknya sendiri.
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001'; -- staf Toko B

  select count(*) into visible_count from shifts where business_id = '11111111-1111-1111-1111-111111111111';

  if visible_count != 0 then
    raise exception 'FAIL test 16a: staf Toko B bisa lihat % shift milik Toko A (harusnya 0)', visible_count;
  end if;
  raise notice 'PASS test 16a: isolasi tenant shifts';
end $$;

do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- staf Toko A, role staff

  begin
    insert into shifts (business_id, location_id, staff_id, opening_cash)
    values ('11111111-1111-1111-1111-111111111111', '11111111-0ca0-0000-0000-000000000001', '11111111-aaaa-1111-aaaa-111111111111', 100000);
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 16b: insert shift langsung oleh role staff tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 16b: insert langsung ke shifts ditolak untuk role staff (backstop is_full_access())';
end $$;

-- ============================================================
-- TEST 17: receipt_imports (migration 0015/0019) — tenant isolation di select
-- (§15.1: ini asumsi dasar yang bikin bug GET tanpa requireStaff() "cuma"
-- berlebihan bukan bocor — test ini yang MEMBUKTIKAN asumsi itu benar, bukan
-- cuma diasumsikan) + insert lintas tenant ditolak.
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role service_role;
  insert into receipt_imports (business_id, uploaded_by, source, status) values
    ('11111111-1111-1111-1111-111111111111', '11111111-aaaa-1111-aaaa-111111111111', 'manual', 'pending'),
    ('22222222-2222-2222-2222-222222222222', '22222222-aaaa-2222-aaaa-222222222222', 'manual', 'pending');

  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- staf Toko A

  select count(*) into visible_count from receipt_imports where business_id = '22222222-2222-2222-2222-222222222222';

  if visible_count != 0 then
    raise exception 'FAIL test 17a: staf Toko A bisa lihat % receipt_imports milik Toko B (harusnya 0) — kalau ini gagal, §15.1 sebenarnya BOCOR beneran, bukan cuma berlebihan', visible_count;
  end if;
  raise notice 'PASS test 17a: isolasi tenant receipt_imports terbukti di RLS (validasi dasar untuk §15.1)';
end $$;

do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- staf Toko A

  begin
    insert into receipt_imports (business_id, uploaded_by, source, status)
    values ('22222222-2222-2222-2222-222222222222', '11111111-aaaa-1111-aaaa-111111111111', 'manual', 'pending');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 17b: insert receipt_imports lintas tenant tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 17b: insert receipt_imports lintas tenant ditolak';
end $$;

-- ============================================================
-- TEST 18: product_aliases (migration 0007/0019) — write butuh is_full_access()
-- via join ke products, PERSIS kasus yang membuat PATCH .../products/[id]
-- (§15.4, penambahan edit aliases) butuh guard eksplisit role di Route
-- Handler: tanpa guard itu, role 'staff' yang PATCH aliases=[] akan dapat
-- 200 sukses padahal DELETE-nya diam-diam 0 baris kena RLS. Test ini yang
-- membuktikan RLS-nya benar (silent-no-op-nya), aplikasi yang menutup celah UX-nya.
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001'; -- role staff, BUKAN full_access

  begin
    insert into product_aliases (product_id, alias) values ('a1111111-0000-0000-0000-000000000001', 'alias ilegal dari staff');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 18a: role staff insert product_aliases tidak ditolak WITH CHECK is_full_access() (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 18a: role staff ditolak tulis product_aliases';
end $$;

do $$
declare
  new_id uuid;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002'; -- role owner, full_access

  insert into product_aliases (product_id, alias) values ('a1111111-0000-0000-0000-000000000001', 'alias sah dari owner')
    returning id into new_id;

  if new_id is null then
    raise exception 'FAIL test 18b: owner gagal insert product_aliases untuk produk tenant sendiri';
  end if;
  raise notice 'PASS test 18b: owner bisa insert product_aliases untuk produk tenant sendiri';
end $$;

-- ============================================================
-- TEST 19: agent_execution_metrics (migration 0016/0019, §14.1) — insert
-- CUMA boleh service_role, bahkan owner/full_access authenticated TETAP
-- ditolak (policy-nya literal auth.role() = 'service_role', bukan
-- is_full_access()) — ini yang memastikan pola "createClient() verifikasi
-- staf dulu, createAdminClient() baru insert" di /api/agent/metrics BUKAN
-- pilihan gaya, tapi satu-satunya jalan yang bisa tembus RLS.
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated; set local request.jwt.claim.role = 'authenticated'; -- auth.role() membaca klaim role seperti PostgREST
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002'; -- owner, full_access — TETAP harus ditolak

  begin
    insert into agent_execution_metrics (business_id, agent_type, latency_ms, succeeded)
    values ('11111111-1111-1111-1111-111111111111', 'query', 500, true);
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test 19: owner (authenticated, full_access) insert agent_execution_metrics tidak ditolak (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test 19: insert agent_execution_metrics ditolak untuk authenticated role apapun, cuma service_role yang lolos';
end $$;

rollback; -- semua fixture & efek test dibuang, tidak mengotori database
