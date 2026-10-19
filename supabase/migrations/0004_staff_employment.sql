-- 0004_staff_employment.sql — §3.1.3
-- Placeholder payroll, terpisah dari staff (auth) karena berisi data finansial sensitif.
-- Belum dipakai fitur apa pun; RLS-nya (0019) sengaja lebih ketat dari tabel lain.

create type employment_type as enum ('full_time', 'part_time', 'contract');

create table staff_employment (
  staff_id uuid primary key references staff(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  employment_type employment_type,
  base_salary numeric(14,2),
  hire_date date,
  bank_name text,
  bank_account_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_staff_employment_updated_at before update on staff_employment
  for each row execute function set_updated_at();
