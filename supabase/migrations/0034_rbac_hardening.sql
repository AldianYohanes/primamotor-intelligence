-- 0034_rbac_hardening.sql
--
-- Menutup dua celah RBAC yang hanya dijaga di app-layer (Route Handler), padahal
-- browser memegang anon key + JWT sesi dan bisa memanggil PostgREST langsung:
--
-- 1. Eskalasi role. Policy "staff update within tenant or as admin" (0019) tidak
--    membatasi kolom, jadi owner mana pun (termasuk hasil signup mandiri) bisa
--    `update staff set role = 'admin'` pada barisnya sendiri. is_super_admin()
--    hanya mengecek role = 'admin', sehingga owner itu langsung jadi super admin
--    lintas tenant dan bisa meng-approve tokonya sendiri. Validasi zod
--    z.enum(["owner","staff"]) di /api/admin/staff tidak ikut terlewati jalur ini.
--
-- 2. Cek login terlewati. Status tenant (pending_verification/suspended/rejected)
--    dan staf nonaktif hanya dicek di /api/auth/login. Auth user tetap ada, dan
--    synthetic email-nya bisa ditebak ({slug}.{username}@domain), jadi
--    signInWithPassword langsung ke Supabase Auth tetap memberi sesi yang oleh
--    RLS diperlakukan sebagai anggota tenant.
--
-- Lockout PIN (locked_until) sengaja TIDAK ikut dicek di helper RLS: counter
-- lockout hanya naik lewat /api/auth/login, jadi percobaan langsung ke Supabase
-- Auth tidak menaikkannya, sementara penyerang yang menebak PIN lewat route
-- resmi bisa membuat sesi aktif korban kehilangan akses 15 menit (DoS).

-- ============================================================
-- 1. Helper RLS: hanya staf aktif di tenant aktif yang dianggap anggota tenant
-- ============================================================

create or replace function auth_business_id() returns uuid as $$
  select s.business_id
  from staff s
  join businesses b on b.id = s.business_id
  where s.auth_user_id = auth.uid()
    and s.is_active
    and b.status = 'active'
  limit 1;
$$ language sql stable security definer set search_path = public;

create or replace function is_super_admin() returns boolean as $$
  select exists (
    select 1 from staff
    where auth_user_id = auth.uid() and role = 'admin' and is_active
  );
$$ language sql stable security definer set search_path = public;

create or replace function is_full_access() returns boolean as $$
  select exists (
    select 1 from staff
    where auth_user_id = auth.uid() and role in ('admin', 'owner') and is_active
  );
$$ language sql stable security definer set search_path = public;

-- ============================================================
-- 2. Hak tulis tabel staff dari sesi user dipersempit
-- ============================================================

-- Insert staf baru sudah lewat service_role (POST /api/admin/staff membuat
-- auth user dulu), delete tidak dipakai (staf dinonaktifkan, bukan dihapus).
revoke insert, delete on staff from authenticated, anon;

-- Dari sesi user hanya kolom ini yang boleh diubah. auth_user_id, business_id,
-- username, dan counter lockout hanya boleh diubah service_role.
revoke update on staff from authenticated, anon;
grant update (full_name, role, is_active) on staff to authenticated;

-- Role 'admin' = super admin (pemilik aplikasi). Hanya super admin sendiri,
-- service_role, atau operator DB yang boleh memberi/mencabutnya, dan baris
-- milik super admin tidak boleh diubah owner tenant tempat akun itu terdaftar
-- (mis. menonaktifkan akun pemilik aplikasi).
create or replace function staff_guard_admin_role() returns trigger as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (new.role = 'admin' or (tg_op = 'UPDATE' and old.role = 'admin'))
     and not is_super_admin() then
    raise exception 'Role admin (super admin) hanya bisa diatur oleh operator platform'
      using errcode = '42501';
  end if;
  return new;
end;
-- Sengaja SECURITY INVOKER: current_user harus role pemanggil (authenticated),
-- bukan pemilik fungsi. is_super_admin() sendiri tetap security definer.
$$ language plpgsql set search_path = public;

drop trigger if exists trg_staff_guard_admin_role on staff;
create trigger trg_staff_guard_admin_role
  before insert or update on staff
  for each row execute function staff_guard_admin_role();

-- Naskah: super admin diikat pada tepat satu akun. Index hanya dibuat kalau
-- data saat ini sudah memenuhi, supaya migrasi tidak gagal di DB yang terlanjur
-- punya lebih dari satu admin (bereskan manual dulu, lalu buat index ini).
do $$
begin
  if (select count(*) from staff where role = 'admin') <= 1 then
    create unique index if not exists staff_single_super_admin on staff ((true)) where role = 'admin';
  else
    raise notice 'Lebih dari satu staf ber-role admin; index staff_single_super_admin TIDAK dibuat.';
  end if;
end $$;

-- ============================================================
-- 3. Audit peralihan tenant oleh super admin
-- ============================================================

create table if not exists tenant_access_log (
  id uuid primary key default uuid_generate_v4(),
  admin_staff_id uuid not null references staff(id),
  business_id uuid references businesses(id) on delete set null,
  action text not null check (action in ('enter', 'leave')),
  created_at timestamptz not null default now()
);

comment on table tenant_access_log is
  'Jejak super admin masuk/keluar tenant lain (naskah: akses lintas tenant wajib memilih tenant aktif dan tercatat). Ditulis via service_role dari /api/admin/active-tenant.';

create index if not exists tenant_access_log_created_at_idx on tenant_access_log (created_at desc);

alter table tenant_access_log enable row level security;

create policy "tenant_access_log read super admin" on tenant_access_log for select
  using (is_super_admin());

create policy "tenant_access_log insert service_role" on tenant_access_log for insert
  with check (auth.role() = 'service_role');
