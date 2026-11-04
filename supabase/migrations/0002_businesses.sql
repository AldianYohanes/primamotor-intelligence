-- 0002_businesses.sql
-- Fondasi multi-tenant (desain-database §3.0)

create table businesses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  address text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  -- Ditambahkan untuk mendukung alur self-service signup (keputusan Ronde 3 #3):
  -- signup langsung membuat business dengan status 'pending_verification',
  -- admin (developer) mengaktifkan manual setelah verifikasi sebelum toko bisa dipakai staf.
  created_at timestamptz not null default now()
);

-- Perluas status untuk mendukung alur self-service (lihat 0021_signup.sql untuk RPC-nya)
alter table businesses drop constraint businesses_status_check;
alter table businesses add constraint businesses_status_check
  check (status in ('pending_verification', 'active', 'suspended', 'rejected'));

comment on table businesses is
  'Tabel akar multi-tenant. Prima Motor Volvo adalah baris pertama, bukan hardcoded di kode.';
comment on column businesses.status is
  'pending_verification: hasil self-service signup, belum bisa dipakai staf sampai admin approve. active: siap dipakai. suspended/rejected: akses ditolak.';
