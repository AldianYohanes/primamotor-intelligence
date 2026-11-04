-- 0009_suppliers.sql — §3.9 (butuh businesses)
-- products.preferred_supplier_id di-ALTER di sini (setelah suppliers ada).
-- reorder_suggestions.suggested_supplier_id di-ALTER di 0017_monitoring.sql (tabelnya belum ada di sini).

create table suppliers (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_suppliers_business on suppliers (business_id);

alter table products add column preferred_supplier_id uuid references suppliers(id);
