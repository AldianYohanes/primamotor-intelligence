-- 0013_stock_rpc.sql — §4.2.1
-- RPC atomik: idempoten (retry-safe) & transfer sebagai satu transaksi DB (rollback penuh jika gagal).

create or replace function record_stock_transaction(
  p_business_id uuid, p_product_id uuid, p_location_id uuid,
  p_type transaction_type, p_quantity int, p_staff_id uuid,
  p_unit_price numeric default null, p_supplier_id uuid default null,
  p_idempotency_key text default null, p_audit_log_id uuid default null, p_notes text default null
) returns uuid as $$
declare
  v_id uuid;
  v_price numeric;
  v_existing uuid;
begin
  if p_idempotency_key is not null then
    select id into v_existing from stock_transactions
      where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if p_type in ('keluar', 'transfer_out', 'adjustment_out') then
    if (select available_quantity from stock where product_id = p_product_id and location_id = p_location_id) < p_quantity then
      raise exception 'Stok tersedia tidak mencukupi untuk transaksi ini (sudah termasuk kuantitas yang direservasi)';
    end if;
  end if;

  v_price := coalesce(p_unit_price, (select unit_cost from products where id = p_product_id));

  insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, unit_price, supplier_id, idempotency_key, staff_id, agent_audit_log_id, notes)
  values (p_business_id, p_product_id, p_location_id, p_type, p_quantity, v_price, p_supplier_id, p_idempotency_key, p_staff_id, p_audit_log_id, p_notes)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql;

create or replace function transfer_stock(
  p_business_id uuid, p_product_id uuid, p_quantity int,
  p_from_location_id uuid, p_to_location_id uuid, p_staff_id uuid,
  p_audit_log_id uuid default null, p_idempotency_key text default null
) returns void as $$
declare
  v_out_id uuid;
  v_in_id uuid;
begin
  if p_from_location_id = p_to_location_id then
    raise exception 'Lokasi asal dan tujuan tidak boleh sama';
  end if;

  v_out_id := record_stock_transaction(
    p_business_id => p_business_id, p_product_id => p_product_id, p_location_id => p_from_location_id,
    p_type => 'transfer_out', p_quantity => p_quantity, p_staff_id => p_staff_id,
    p_audit_log_id => p_audit_log_id,
    p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':out' else null end
  );
  v_in_id := record_stock_transaction(
    p_business_id => p_business_id, p_product_id => p_product_id, p_location_id => p_to_location_id,
    p_type => 'transfer_in', p_quantity => p_quantity, p_staff_id => p_staff_id,
    p_audit_log_id => p_audit_log_id,
    p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':in' else null end
  );

  update stock_transactions set related_transaction_id = v_in_id where id = v_out_id;
  update stock_transactions set related_transaction_id = v_out_id where id = v_in_id;
end;
$$ language plpgsql;
