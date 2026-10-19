-- supabase/tests/rls_rbac.test.sql — migrasi 0034_rbac_hardening
--
-- Cara jalankan (butuh instance lokal via `supabase start`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_rbac.test.sql
--
-- Pola sama dengan rls.test.sql: identitas disimulasikan lewat
-- `set local role authenticated` + `request.jwt.claim.sub`, test "harus ditolak"
-- menyimpan SQLSTATE lalu assert di luar blok exception.

begin;

-- ============================================================
-- FIXTURES (sebagai superuser, sebelum role diganti)
-- ============================================================

insert into businesses (id, name, slug, status) values
  ('11111111-1111-1111-1111-111111111111', 'Toko A', 'toko-a', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Toko B', 'toko-b', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'Toko Pending', 'toko-pending', 'pending_verification');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'toko-a.staff@staff.internal'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'toko-a.owner@staff.internal'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'toko-a.nonaktif@staff.internal'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'toko-b.staff@staff.internal'),
  ('dddddddd-0000-0000-0000-000000000001', 'toko-pending.owner@staff.internal'),
  ('cccccccc-0000-0000-0000-000000000001', 'admin.dev@staff.internal');

insert into staff (id, business_id, auth_user_id, username, full_name, role, is_active) values
  ('11111111-aaaa-1111-aaaa-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff', 'Staf Toko A', 'staff', true),
  ('11111111-bbbb-1111-bbbb-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'owner', 'Owner Toko A', 'owner', true),
  ('11111111-cccc-1111-cccc-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'nonaktif', 'Staf Nonaktif A', 'staff', false),
  ('22222222-aaaa-2222-aaaa-222222222222', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'staff', 'Staf Toko B', 'staff', true),
  ('33333333-bbbb-3333-bbbb-333333333333', '33333333-3333-3333-3333-333333333333', 'dddddddd-0000-0000-0000-000000000001', 'owner', 'Owner Pending', 'owner', true),
  ('44444444-aaaa-4444-aaaa-444444444444', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'admin', 'Admin Dev', 'admin', true);

insert into products (id, business_id, name) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Radiator 240'),
  ('b2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Karburator 740'),
  ('c3333333-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Filter Oli Pending');

insert into tenant_access_log (admin_staff_id, business_id, action) values
  ('44444444-aaaa-4444-aaaa-444444444444', '22222222-2222-2222-2222-222222222222', 'enter');

-- ============================================================
-- TEST R1: owner TIDAK bisa menaikkan dirinya jadi admin (super admin)
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

  begin
    update staff set role = 'admin' where id = '11111111-bbbb-1111-bbbb-111111111111';
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test R1: owner bisa set role admin (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test R1: owner tidak bisa set role admin';
end $$;

-- ============================================================
-- TEST R2: owner TIDAK bisa mengganti auth_user_id staf (ambil alih akun)
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

  begin
    update staff set auth_user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
    where id = '11111111-aaaa-1111-aaaa-111111111111';
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test R2: owner bisa ubah auth_user_id (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test R2: kolom auth_user_id tidak bisa diubah dari sesi user';
end $$;

-- ============================================================
-- TEST R3: owner TIDAK bisa insert staf langsung (harus lewat service_role)
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

  begin
    insert into staff (business_id, auth_user_id, username, full_name, role)
    values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001', 'susup', 'Susupan', 'staff');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test R3: owner bisa insert staf langsung (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test R3: insert staf dari sesi user ditolak';
end $$;

-- ============================================================
-- TEST R4: owner TETAP bisa mengubah kolom yang diizinkan (full_name, role staff/owner)
-- ============================================================
do $$
declare
  v_rows int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

  update staff set full_name = 'Staf A Diganti', role = 'owner'
  where id = '11111111-aaaa-1111-aaaa-111111111111';
  get diagnostics v_rows = row_count;
  if v_rows != 1 then
    raise exception 'FAIL test R4: owner gagal update staf tenant sendiri (% baris)', v_rows;
  end if;
  raise notice 'PASS test R4: owner masih bisa kelola staf tenant sendiri';
end $$;

-- ============================================================
-- TEST R5: staf NONAKTIF yang punya sesi tidak melihat data tenant
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';

  select count(*) into visible_count from products;
  if visible_count != 0 then
    raise exception 'FAIL test R5: staf nonaktif masih melihat % produk', visible_count;
  end if;
  raise notice 'PASS test R5: staf nonaktif tidak melihat data tenant';
end $$;

-- ============================================================
-- TEST R6: owner tenant PENDING (login langsung ke Supabase Auth) tidak melihat data
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';

  select count(*) into visible_count from products;
  if visible_count != 0 then
    raise exception 'FAIL test R6: owner tenant pending melihat % produk', visible_count;
  end if;
  raise notice 'PASS test R6: tenant pending tidak punya akses data';
end $$;

-- ============================================================
-- TEST R7: super admin tetap bisa membaca lintas tenant
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000001';

  select count(*) into visible_count from products
  where business_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
  if visible_count != 2 then
    raise exception 'FAIL test R7: super admin harusnya melihat 2 produk lintas tenant, terlihat %', visible_count;
  end if;
  raise notice 'PASS test R7: super admin membaca lintas tenant';
end $$;

-- ============================================================
-- TEST R8: staf aktif biasa tidak bisa membaca tenant_access_log
-- ============================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

  select count(*) into visible_count from tenant_access_log;
  if visible_count != 0 then
    raise exception 'FAIL test R8: owner membaca % baris tenant_access_log', visible_count;
  end if;
  raise notice 'PASS test R8: tenant_access_log hanya untuk super admin';
end $$;

-- ============================================================
-- TEST R9: owner di tenant yang sama TIDAK bisa menonaktifkan akun super admin
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

  begin
    update staff set is_active = false where id = '44444444-aaaa-4444-aaaa-444444444444';
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL test R9: owner bisa mengubah baris super admin (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS test R9: baris super admin terlindungi dari owner tenant';
end $$;

rollback;
