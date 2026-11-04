-- 0006_products.sql — §3.4 (butuh pg_trgm dari 0001)
-- preferred_supplier_id di-ALTER masuk di 0009 setelah tabel suppliers ada.

create table products (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  part_number text,
  name text not null,
  category text,
  unit text not null default 'pcs',
  description text,
  min_threshold int default 0,
  unit_cost numeric(14,2) default 0 check (unit_cost >= 0),
  selling_price numeric(14,2) default 0 check (selling_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, part_number)
);

create index idx_products_name_trgm on products using gin (name gin_trgm_ops);
create index idx_products_business on products (business_id);

create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();

comment on column products.unit_cost is
  'Harga beli referensi TERKINI, bukan historis. Untuk laporan valuasi historis, sumber kebenaran adalah stock_transactions.unit_price (snapshot per transaksi).';
