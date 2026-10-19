-- 0017_monitoring.sql — §6.1

create type suggestion_status as enum ('pending', 'acknowledged', 'ordered', 'dismissed');

create table reorder_suggestions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid references products(id),
  suggested_quantity int not null,
  reason text,
  trend_snapshot jsonb,
  status suggestion_status not null default 'pending',
  acknowledged_by uuid references staff(id),
  suggested_supplier_id uuid references suppliers(id),
  created_at timestamptz not null default now()
);

create index idx_reorder_business_status on reorder_suggestions (business_id, status);

create or replace function get_sales_trend(p_product_id uuid, p_months int)
returns table(period date, total_keluar int) as $$
  select date_trunc('month', created_at)::date as period,
         sum(quantity)::int as total_keluar
  from stock_transactions
  where product_id = p_product_id
    and transaction_type = 'keluar'
    and created_at >= now() - (p_months || ' months')::interval
  group by 1
  order by 1;
$$ language sql stable;
