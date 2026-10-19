-- 0003_staff_and_auth.sql
-- §3.7 (fungsi generik updated_at, dibuat duluan sebelum dipakai trigger di file ini)
-- §3.1 staff, §3.1.1 strategi auth username+PIN via synthetic email

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create type user_role as enum ('admin', 'owner', 'staff');

create table staff (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id),
  username text not null,
  full_name text not null,
  role user_role not null default 'staff',
  is_active boolean not null default true,
  failed_login_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, username)
);

create trigger trg_staff_updated_at before update on staff
  for each row execute function set_updated_at();

comment on column staff.locked_until is
  'Lockout 15 menit otomatis setelah 5x percobaan PIN gagal (keputusan produk: durasi tetap, bukan permanen).';

-- §8.1 Helper functions RLS (dipindah lebih awal karena banyak policy di 0019 bergantung padanya,
-- dan beberapa RPC di migration berikutnya juga memanggilnya)

create or replace function auth_business_id() returns uuid as $$
  select business_id from staff where auth_user_id = auth.uid() limit 1;
$$ language sql stable security definer;

create or replace function is_super_admin() returns boolean as $$
  select exists (
    select 1 from staff where auth_user_id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer;

create or replace function is_full_access() returns boolean as $$
  select exists (
    select 1 from staff where auth_user_id = auth.uid() and role in ('admin', 'owner')
  );
$$ language sql stable security definer;
