-- 0012_stock_trigger.sql
-- Setiap insert ke stock_transactions otomatis merekalkulasi saldo `stock` via upsert.

create or replace function apply_stock_transaction() returns trigger as $$
begin
  insert into stock (business_id, product_id, location_id, quantity, last_updated_at)
  values (
    new.business_id,
    new.product_id,
    new.location_id,
    case when new.transaction_type in ('masuk', 'transfer_in', 'retur', 'adjustment_in') then new.quantity
         when new.transaction_type in ('keluar', 'transfer_out', 'adjustment_out') then -new.quantity
         else new.quantity
    end,
    now()
  )
  on conflict (product_id, location_id)
  do update set
    quantity = stock.quantity + excluded.quantity,
    last_updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_apply_stock_transaction
after insert on stock_transactions
for each row execute function apply_stock_transaction();
