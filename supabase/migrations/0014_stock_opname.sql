-- 0014_stock_opname.sql — §4.3 (audit fisik, Admin Web App)

create table stock_opname (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid references products(id),
  location_id uuid references locations(id),
  system_quantity int not null,
  counted_quantity int not null,
  discrepancy int generated always as (counted_quantity - system_quantity) stored,
  staff_id uuid references staff(id),
  notes text,
  opname_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index idx_opname_business on stock_opname (business_id);
