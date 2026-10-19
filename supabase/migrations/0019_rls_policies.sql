-- 0019_rls_policies.sql — §8
-- Helper functions (auth_business_id, is_super_admin, is_full_access) sudah dibuat di 0003.
-- Pola umum: baca = tenant sendiri ATAU is_super_admin(); tulis = tenant sendiri DAN is_full_access(),
-- kecuali tabel yang memang wajib ditulis lewat service_role (agent write path) atau read-only global.

-- ============================================================
-- staff
-- ============================================================
alter table staff enable row level security;

create policy "staff read own tenant" on staff for select
  using (business_id = auth_business_id() or is_super_admin());

create policy "staff manage within tenant or as admin" on staff for insert
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());

create policy "staff update within tenant or as admin" on staff for update
  using (business_id = auth_business_id() and is_full_access() or is_super_admin())
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());

create policy "staff delete within tenant or as admin" on staff for delete
  using (business_id = auth_business_id() and is_full_access() or is_super_admin());

-- ============================================================
-- staff_employment — data gaji, LEBIH KETAT dari pola umum (§8.3 pengecualian)
-- ============================================================
alter table staff_employment enable row level security;

create policy "staff_employment full_access only" on staff_employment for all
  using (business_id = auth_business_id() and is_full_access() or is_super_admin())
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());

-- ============================================================
-- locations
-- ============================================================
alter table locations enable row level security;

create policy "locations read own tenant" on locations for select
  using (business_id = auth_business_id() or is_super_admin());

create policy "locations write full_access" on locations for insert
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());
create policy "locations update full_access" on locations for update
  using (business_id = auth_business_id() and is_full_access() or is_super_admin())
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());
create policy "locations delete full_access" on locations for delete
  using (business_id = auth_business_id() and is_full_access() or is_super_admin());

-- ============================================================
-- car_models — referensi bersama lintas tenant, read-only untuk semua authenticated user
-- ============================================================
alter table car_models enable row level security;

create policy "car_models read all authenticated" on car_models for select
  using (auth.role() = 'authenticated');

create policy "car_models write super_admin only" on car_models for all
  using (is_super_admin())
  with check (is_super_admin());

-- ============================================================
-- products
-- ============================================================
alter table products enable row level security;

create policy "products read own tenant" on products for select
  using (business_id = auth_business_id() or is_super_admin());

create policy "products write full_access" on products for insert
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());
create policy "products update full_access" on products for update
  using (business_id = auth_business_id() and is_full_access() or is_super_admin())
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());
create policy "products delete full_access" on products for delete
  using (business_id = auth_business_id() and is_full_access() or is_super_admin());

-- ============================================================
-- product_model_compatibility & product_aliases — akses lewat join ke products
-- ============================================================
alter table product_model_compatibility enable row level security;

create policy "product_model_compat read via product tenant" on product_model_compatibility for select
  using (exists (select 1 from products p where p.id = product_id and (p.business_id = auth_business_id() or is_super_admin())));
create policy "product_model_compat write via product tenant" on product_model_compatibility for all
  using (exists (select 1 from products p where p.id = product_id and p.business_id = auth_business_id() and is_full_access()) or is_super_admin())
  with check (exists (select 1 from products p where p.id = product_id and p.business_id = auth_business_id() and is_full_access()) or is_super_admin());

alter table product_aliases enable row level security;

create policy "product_aliases read via product tenant" on product_aliases for select
  using (exists (select 1 from products p where p.id = product_id and (p.business_id = auth_business_id() or is_super_admin())));
create policy "product_aliases write via product tenant" on product_aliases for all
  using (exists (select 1 from products p where p.id = product_id and p.business_id = auth_business_id() and is_full_access()) or is_super_admin())
  with check (exists (select 1 from products p where p.id = product_id and p.business_id = auth_business_id() and is_full_access()) or is_super_admin());

-- ============================================================
-- suppliers
-- ============================================================
alter table suppliers enable row level security;

create policy "suppliers read own tenant" on suppliers for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "suppliers write full_access" on suppliers for all
  using (business_id = auth_business_id() and is_full_access() or is_super_admin())
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());

-- ============================================================
-- stock — dibaca semua staf tenant (termasuk agent chat), ditulis HANYA lewat service_role
-- (agent tools & RPC berjalan dengan admin client setelah HITL)
-- ============================================================
alter table stock enable row level security;

create policy "stock read own tenant" on stock for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "stock service role writes only" on stock for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- stock_transactions — ledger. Baca oleh tenant, tulis HANYA service_role (lewat RPC record_stock_transaction)
-- ============================================================
alter table stock_transactions enable row level security;

create policy "stock_transactions read own tenant" on stock_transactions for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "stock_transactions service role writes only" on stock_transactions for insert
  with check (auth.role() = 'service_role');
-- Ledger append-only secara desain: TIDAK ada policy update/delete untuk siapa pun (termasuk full_access),
-- koreksi kesalahan dilakukan lewat transaksi 'adjustment' baru, bukan mengubah baris lama.

-- ============================================================
-- stock_opname
-- ============================================================
alter table stock_opname enable row level security;

create policy "stock_opname read own tenant" on stock_opname for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "stock_opname insert own tenant" on stock_opname for insert
  with check (business_id = auth_business_id() or is_super_admin());

-- ============================================================
-- receipt_imports & receipt_import_items
-- ============================================================
alter table receipt_imports enable row level security;

create policy "receipt_imports read own tenant" on receipt_imports for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "receipt_imports write own tenant" on receipt_imports for insert
  with check (business_id = auth_business_id() or is_super_admin());
create policy "receipt_imports update full_access" on receipt_imports for update
  using (business_id = auth_business_id() and is_full_access() or is_super_admin())
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());

alter table receipt_import_items enable row level security;

create policy "receipt_import_items read via import tenant" on receipt_import_items for select
  using (exists (select 1 from receipt_imports ri where ri.id = import_id and (ri.business_id = auth_business_id() or is_super_admin())));
create policy "receipt_import_items write via import tenant" on receipt_import_items for insert
  with check (exists (select 1 from receipt_imports ri where ri.id = import_id and ri.business_id = auth_business_id()) or is_super_admin());
create policy "receipt_import_items update full_access via import tenant" on receipt_import_items for update
  using (exists (select 1 from receipt_imports ri where ri.id = import_id and ri.business_id = auth_business_id() and is_full_access()) or is_super_admin())
  with check (exists (select 1 from receipt_imports ri where ri.id = import_id and ri.business_id = auth_business_id() and is_full_access()) or is_super_admin());

-- ============================================================
-- agent_conversations & agent_messages
-- ============================================================
alter table agent_conversations enable row level security;

create policy "agent_conversations read own tenant" on agent_conversations for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "agent_conversations insert own tenant" on agent_conversations for insert
  with check (business_id = auth_business_id() or is_super_admin());
create policy "agent_conversations update own tenant" on agent_conversations for update
  using (business_id = auth_business_id() or is_super_admin())
  with check (business_id = auth_business_id() or is_super_admin());

alter table agent_messages enable row level security;

create policy "agent_messages read via conversation tenant" on agent_messages for select
  using (exists (select 1 from agent_conversations c where c.id = conversation_id and (c.business_id = auth_business_id() or is_super_admin())));
create policy "agent_messages insert via conversation tenant" on agent_messages for insert
  with check (exists (select 1 from agent_conversations c where c.id = conversation_id and c.business_id = auth_business_id()) or is_super_admin());

-- ============================================================
-- agent_audit_log — baca oleh siapa pun di tenant (transparansi ke owner), tulis service_role
-- ============================================================
alter table agent_audit_log enable row level security;

create policy "agent_audit_log read own tenant" on agent_audit_log for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "agent_audit_log service role writes" on agent_audit_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- agent_execution_metrics — service_role only (ditulis backend saat tool-call selesai)
-- ============================================================
alter table agent_execution_metrics enable row level security;

create policy "agent_execution_metrics read own tenant" on agent_execution_metrics for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "agent_execution_metrics service role writes" on agent_execution_metrics for insert
  with check (auth.role() = 'service_role');

-- ============================================================
-- reorder_suggestions — dibaca tenant, ditulis cron (service_role); acknowledge oleh full_access
-- ============================================================
alter table reorder_suggestions enable row level security;

create policy "reorder_suggestions read own tenant" on reorder_suggestions for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "reorder_suggestions insert service role" on reorder_suggestions for insert
  with check (auth.role() = 'service_role');
create policy "reorder_suggestions update full_access" on reorder_suggestions for update
  using (business_id = auth_business_id() and is_full_access() or is_super_admin())
  with check (business_id = auth_business_id() and is_full_access() or is_super_admin());

-- ============================================================
-- push_subscriptions — akses lewat join ke staff milik diri sendiri
-- ============================================================
alter table push_subscriptions enable row level security;

create policy "push_subscriptions read own" on push_subscriptions for select
  using (exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid()) or is_super_admin());
create policy "push_subscriptions write own" on push_subscriptions for insert
  with check (exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid()));
create policy "push_subscriptions update own" on push_subscriptions for update
  using (exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid()))
  with check (exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid()));

-- ============================================================
-- notifications
-- ============================================================
alter table notifications enable row level security;

create policy "notifications read own tenant" on notifications for select
  using (
    business_id = auth_business_id()
    and (staff_id is null or exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid()))
    or is_super_admin()
  );
create policy "notifications write service role" on notifications for insert
  with check (auth.role() = 'service_role');
create policy "notifications mark read own" on notifications for update
  using (exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid()) or is_super_admin())
  with check (exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid()) or is_super_admin());

-- ============================================================
-- businesses — staf hanya boleh baca bisnisnya sendiri; hanya super_admin yang boleh
-- ubah status (approve/suspend/reject), relevan untuk alur self-service signup.
-- ============================================================
alter table businesses enable row level security;

create policy "businesses read own" on businesses for select
  using (id = auth_business_id() or is_super_admin());
create policy "businesses insert service role" on businesses for insert
  with check (auth.role() = 'service_role');
create policy "businesses update super_admin or owner limited fields" on businesses for update
  using (is_super_admin() or (id = auth_business_id() and is_full_access()))
  with check (is_super_admin() or (id = auth_business_id() and is_full_access()));
