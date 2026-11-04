-- 0005_locations_car_models.sql — §3.2, §3.3

create type location_type as enum ('toko', 'gudang');

create table locations (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  type location_type not null,
  address text,
  created_at timestamptz not null default now()
);

-- Referensi bersama lintas tenant (lihat catatan §3.0) — sengaja TANPA business_id
create table car_models (
  id uuid primary key default uuid_generate_v4(),
  brand text not null default 'Volvo',
  name text not null,
  era_group text,
  year_start int,
  year_end int,
  unique (brand, name)
);
