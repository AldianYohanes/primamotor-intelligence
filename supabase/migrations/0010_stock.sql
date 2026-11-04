-- 0010_stock.sql — §4.1, §4.1.1
-- Saldo stok TERKINI — turunan, bukan sumber kebenaran (ledger = stock_transactions).

create table stock (
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  reserved_quantity int not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= quantity),
  available_quantity int generated always as (quantity - reserved_quantity) stored,
  last_updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  primary key (product_id, location_id)
);

create index idx_stock_business on stock (business_id);

create or replace function reserve_stock(p_product_id uuid, p_location_id uuid, p_quantity int) returns void as $$
begin
  update stock set reserved_quantity = reserved_quantity + p_quantity
  where product_id = p_product_id and location_id = p_location_id
    and quantity - reserved_quantity >= p_quantity;

  if not found then
    raise exception 'Stok tersedia tidak mencukupi untuk reservasi ini';
  end if;
end;
$$ language plpgsql;

create or replace function release_reservation(p_product_id uuid, p_location_id uuid, p_quantity int) returns void as $$
begin
  update stock set reserved_quantity = greatest(reserved_quantity - p_quantity, 0)
  where product_id = p_product_id and location_id = p_location_id;
end;
$$ language plpgsql;
