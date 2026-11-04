-- 0011_stock_transactions.sql — §4.2 (butuh suppliers untuk supplier_id)
-- Ledger append-only: sumber kebenaran pergerakan stok. agent_audit_log_id FK
-- ditambahkan lewat ALTER di 0016 karena agent_audit_log belum ada di sini.

create type transaction_type as enum ('masuk', 'keluar', 'transfer_out', 'transfer_in', 'retur', 'adjustment_in', 'adjustment_out');

create table stock_transactions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id),
  location_id uuid not null references locations(id),
  transaction_type transaction_type not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(14,2),
  total_value numeric(14,2) generated always as (quantity * coalesce(unit_price, 0)) stored,
  supplier_id uuid references suppliers(id),
  idempotency_key text,
  related_transaction_id uuid references stock_transactions(id),
  staff_id uuid references staff(id),
  agent_audit_log_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_txn_product_time on stock_transactions (product_id, created_at desc);
create index idx_txn_business on stock_transactions (business_id);
create unique index idx_txn_idempotency on stock_transactions (business_id, idempotency_key) where idempotency_key is not null;

comment on column stock_transactions.business_id is
  'Didenormalisasi dari products/locations supaya RLS multi-tenant bisa filter langsung tanpa join berlapis.';
