-- supabase/tests/rls_agent.test.sql
--
-- Invariant keamanan jalur agent (rancangan-evaluasi.tex: "Pengujian RLS
-- dijalankan langsung terhadap kebijakan basis data"). Fokusnya: apa pun yang
-- diputuskan model di browser, client dengan sesi staf TIDAK BISA mengubah
-- stok atau status audit tanpa lewat Route Handler + PIN.
--
-- Cara jalankan (instance lokal via `supabase start`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_agent.test.sql
--
-- Pola sama dengan rls.test.sql. Test "harus ditolak" menyimpan SQLSTATE lalu
-- assert di luar blok exception (42501 = insufficient_privilege). Untuk UPDATE,
-- RLS tidak melempar error melainkan memfilter baris, jadi yang dicek `found`.

begin;

-- ============================================================
-- FIXTURES (superuser, bypass RLS)
-- ============================================================
insert into businesses (id, name, slug, status) values
  ('a0000000-0000-0000-0000-00000000000a', 'Agent Toko A', 'agent-toko-a', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'Agent Toko B', 'agent-toko-b', 'active');

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'agent-toko-a.staff@staff.internal'),
  ('a0000000-0000-0000-0000-0000000000a2', 'agent-toko-a.owner@staff.internal'),
  ('b0000000-0000-0000-0000-0000000000b1', 'agent-toko-b.staff@staff.internal');

insert into staff (id, business_id, auth_user_id, username, full_name, role) values
  ('a0000000-5a1f-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a1', 'staff', 'Staf A', 'staff'),
  ('a0000000-5a1f-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a2', 'owner', 'Owner A', 'owner'),
  ('b0000000-5a1f-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-0000000000b1', 'staff', 'Staf B', 'staff');

insert into products (id, business_id, name) values
  ('a0000000-0d0c-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Radiator Agent A'),
  ('b0000000-0d0c-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Radiator Agent B');

insert into locations (id, business_id, name, type) values
  ('a0000000-0ca0-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Toko', 'toko'),
  ('a0000000-0ca0-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'Gudang', 'gudang'),
  ('b0000000-0ca0-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Toko', 'toko');

insert into stock (business_id, product_id, location_id, quantity) values
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0d0c-0000-0000-00000000000a', 'a0000000-0ca0-0000-0000-00000000000a', 10),
  ('b0000000-0000-0000-0000-00000000000b', 'b0000000-0d0c-0000-0000-00000000000b', 'b0000000-0ca0-0000-0000-00000000000b', 7);

insert into agent_conversations (id, business_id, staff_id, channel) values
  ('a0000000-c0c0-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-5a1f-0000-0000-0000000000a1', 'test'),
  ('b0000000-c0c0-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'b0000000-5a1f-0000-0000-0000000000b1', 'test');

insert into agent_audit_log (id, business_id, conversation_id, agent_type, tool_name, input_params, status) values
  ('a0000000-a0d1-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-c0c0-0000-0000-00000000000a', 'transaction', 'updateStock', '{"quantity": 3, "direction": "keluar"}', 'pending'),
  ('b0000000-a0d1-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'b0000000-c0c0-0000-0000-00000000000b', 'transaction', 'updateStock', '{"quantity": 1, "direction": "masuk"}', 'pending');

insert into stock_opname (business_id, product_id, location_id, system_quantity, counted_quantity) values
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0d0c-0000-0000-00000000000a', 'a0000000-0ca0-0000-0000-00000000000a', 10, 10),
  ('b0000000-0000-0000-0000-00000000000b', 'b0000000-0d0c-0000-0000-00000000000b', 'b0000000-0ca0-0000-0000-00000000000b', 7, 6);

-- ============================================================
-- AGENT 1: staf tidak bisa mengubah saldo stok langsung (bypass tool + PIN)
-- ============================================================
do $$
declare
  qty int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000a1';

  update stock set quantity = 999
    where product_id = 'a0000000-0d0c-0000-0000-00000000000a' and location_id = 'a0000000-0ca0-0000-0000-00000000000a';
  if found then
    raise exception 'FAIL agent 1: staf berhasil UPDATE stock langsung (harusnya 0 baris, cuma service_role)';
  end if;

  select quantity into qty from stock
    where product_id = 'a0000000-0d0c-0000-0000-00000000000a' and location_id = 'a0000000-0ca0-0000-0000-00000000000a';
  if qty is distinct from 10 then
    raise exception 'FAIL agent 1: saldo stok berubah jadi % (harusnya tetap 10)', qty;
  end if;
  raise notice 'PASS agent 1: UPDATE stock langsung oleh staf tidak berefek';
end $$;

-- ============================================================
-- AGENT 2: owner pun tidak bisa INSERT baris stock langsung
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000a2'; -- owner, full_access

  begin
    insert into stock (business_id, product_id, location_id, quantity)
      values ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0d0c-0000-0000-00000000000a', 'a0000000-0ca0-0000-0000-0000000000a2', 500);
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL agent 2: owner INSERT stock langsung tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS agent 2: INSERT stock langsung ditolak untuk non-service_role';
end $$;

-- ============================================================
-- AGENT 3: staf tidak bisa menandai audit log "confirmed" sendiri
-- (setara melewati konfirmasi PIN dari client)
-- ============================================================
do $$
declare
  st audit_status;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000a1';

  update agent_audit_log set status = 'confirmed', confirmed_by = 'a0000000-5a1f-0000-0000-0000000000a1'
    where id = 'a0000000-a0d1-0000-0000-00000000000a';
  if found then
    raise exception 'FAIL agent 3: staf berhasil mengubah status agent_audit_log dari client';
  end if;

  select status into st from agent_audit_log where id = 'a0000000-a0d1-0000-0000-00000000000a';
  if st is distinct from 'pending' then
    raise exception 'FAIL agent 3: status audit berubah jadi % (harusnya tetap pending)', st;
  end if;
  raise notice 'PASS agent 3: status audit log tidak bisa diubah dari sesi staf';
end $$;

-- ============================================================
-- AGENT 4: staf tidak bisa menyisipkan audit log palsu
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000a1';

  begin
    insert into agent_audit_log (business_id, agent_type, tool_name, input_params, status)
      values ('a0000000-0000-0000-0000-00000000000a', 'transaction', 'updateStock', '{}', 'confirmed');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL agent 4: staf INSERT agent_audit_log tidak ditolak RLS (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS agent 4: INSERT agent_audit_log dari sesi staf ditolak';
end $$;

-- ============================================================
-- AGENT 5: isolasi tenant untuk data yang dibaca agent
-- ============================================================
do $$
declare
  n_stock int;
  n_audit int;
  n_opname int;
  n_conv int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000a1'; -- staf Toko A

  select count(*) into n_stock from stock where business_id = 'b0000000-0000-0000-0000-00000000000b';
  select count(*) into n_audit from agent_audit_log where business_id = 'b0000000-0000-0000-0000-00000000000b';
  select count(*) into n_opname from stock_opname where business_id = 'b0000000-0000-0000-0000-00000000000b';
  select count(*) into n_conv from agent_conversations where business_id = 'b0000000-0000-0000-0000-00000000000b';

  if n_stock + n_audit + n_opname + n_conv != 0 then
    raise exception 'FAIL agent 5: staf A melihat data Toko B (stock=%, audit=%, opname=%, conv=%)', n_stock, n_audit, n_opname, n_conv;
  end if;

  select count(*) into n_stock from stock where business_id = 'a0000000-0000-0000-0000-00000000000a';
  if n_stock != 1 then
    raise exception 'FAIL agent 5: staf A tidak melihat stok tenant sendiri (dapat %)', n_stock;
  end if;
  raise notice 'PASS agent 5: stock/agent_audit_log/stock_opname/agent_conversations terisolasi per tenant';
end $$;

-- ============================================================
-- AGENT 6: tidak bisa menulis pesan ke percakapan tenant lain
-- ============================================================
do $$
declare
  v_state text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000a1';

  begin
    insert into agent_messages (conversation_id, role, content)
      values ('b0000000-c0c0-0000-0000-00000000000b', 'user', 'pesan disusupkan ke tenant lain');
  exception
    when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL agent 6: insert agent_messages ke percakapan Toko B tidak ditolak (sqlstate=%)', coalesce(v_state, 'tidak ada error');
  end if;
  raise notice 'PASS agent 6: agent_messages lintas tenant ditolak';
end $$;

-- ============================================================
-- AGENT 7: request tanpa login (role anon) tidak melihat stock_opname/stock.
-- Ini yang membuktikan GET /api/admin/stock-opname tanpa cek user tidak bocor:
-- route memakai createClient() sehingga query berjalan dengan RLS ini.
-- ============================================================
do $$
declare
  n_opname int;
  n_stock int;
begin
  set local role anon;
  set local request.jwt.claim.sub = '';

  select count(*) into n_opname from stock_opname;
  select count(*) into n_stock from stock;

  if n_opname != 0 or n_stock != 0 then
    raise exception 'FAIL agent 7: role anon melihat % stock_opname dan % stock (harusnya 0)', n_opname, n_stock;
  end if;
  raise notice 'PASS agent 7: tanpa sesi login, stock_opname & stock tidak terbaca';
exception
  when insufficient_privilege then
    raise notice 'PASS agent 7: role anon tidak punya grant ke stock_opname/stock sama sekali';
end $$;

rollback;
