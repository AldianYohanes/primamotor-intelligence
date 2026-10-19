-- 0030_pos_audit_fixes.sql
--
-- Perbaikan dari audit menyeluruh atas migration 0025-0029. Dua celah nyata
-- yang diperbaiki di sini (dua lainnya dari audit — race condition tutup
-- shift & bug widget "shift saya" di terminal — diperbaiki di kode
-- Route Handler/frontend, tidak butuh perubahan SQL):
--
-- 1. record_sale SEBELUMNYA cuma validasi kepemilikan tenant utk customer_id
--    di cabang 'piutang' (lewat FOR UPDATE ... where business_id = p_business_id).
--    Untuk metode pembayaran lain, customer_id (kalau dikirim) langsung
--    dimasukkan ke sales.customer_id TANPA verifikasi sama sekali — Route
--    Handler (yang sudah diperbaiki juga) jadi lapisan pertama, tapi RPC
--    sekarang jadi lapisan kedua yang independen (defense in depth,
--    konsisten dengan prinsip di seluruh RPC lain di project ini).
-- 2. Pesan error 'overpayment_not_allowed_for_split' sebelumnya muncul juga
--    utk kasus SATU metode non-cash (bukan cuma split sungguhan) yang
--    dibayar lebih dari total — membingungkan meski saat ini tidak bisa
--    dipicu lewat UI (frontend selalu kirim amount=total persis utk metode
--    tunggal non-cash). Errornya sekarang dibedakan.

create or replace function record_sale(
  p_business_id uuid,
  p_location_id uuid,
  p_staff_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_payments jsonb default null,
  p_customer_id uuid default null,
  p_discount_amount numeric default 0,
  p_tax_amount numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_notes text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_sale_number text;
  v_existing_sale_id uuid;
  v_existing_sale_number text;
  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_item_discount numeric;
  v_line_subtotal numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_available numeric;
  v_txn_id uuid;
  v_paid_total numeric := 0;
  v_payment_count int := 0;
  v_change numeric := 0;
  v_customer customers%rowtype;
begin
  if p_idempotency_key is not null then
    select id, sale_number into v_existing_sale_id, v_existing_sale_number
      from sales where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if v_existing_sale_id is not null then
      return jsonb_build_object('ok', true, 'sale_id', v_existing_sale_id, 'sale_number', v_existing_sale_number, 'idempotent_replay', true);
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_cart');
  end if;

  -- Perbaikan #1: validasi customer_id UNTUK SEMUA metode pembayaran (bukan
  -- cuma piutang) kalau memang dikirim — dilakukan di awal, sebelum lock
  -- stok, supaya tidak buang kerja kalau memang mau ditolak.
  if p_customer_id is not null and p_payment_method <> 'piutang' then
    if not exists (select 1 from customers where id = p_customer_id and business_id = p_business_id) then
      return jsonb_build_object('ok', false, 'error', 'customer_not_found');
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) order by (value->>'product_id')
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_item_discount := coalesce((v_item->>'discount_amount')::numeric, 0);

    if v_quantity is null or v_quantity <= 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_quantity', 'product_id', v_product_id);
    end if;

    select selling_price into v_unit_price from products
      where id = v_product_id and business_id = p_business_id and is_active = true;
    if v_unit_price is null then
      return jsonb_build_object('ok', false, 'error', 'product_not_found_or_inactive', 'product_id', v_product_id);
    end if;

    select available_quantity into v_available from stock
      where business_id = p_business_id and product_id = v_product_id and location_id = p_location_id
      for update;
    if v_available is null or v_available < v_quantity then
      return jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'product_id', v_product_id);
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity) - v_item_discount;
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_discount_amount, 0) + coalesce(p_tax_amount, 0), 0);

  if p_payment_method = 'piutang' then
    if p_customer_id is null then
      return jsonb_build_object('ok', false, 'error', 'customer_required');
    end if;
    select * into v_customer from customers where id = p_customer_id and business_id = p_business_id for update;
    if v_customer.id is null then
      return jsonb_build_object('ok', false, 'error', 'customer_not_found');
    end if;
    if v_customer.credit_limit <= 0 or (v_customer.balance + v_total) > v_customer.credit_limit then
      return jsonb_build_object('ok', false, 'error', 'credit_limit_exceeded', 'available_credit', greatest(v_customer.credit_limit - v_customer.balance, 0));
    end if;
  else
    if p_payments is null or jsonb_array_length(p_payments) = 0 then
      return jsonb_build_object('ok', false, 'error', 'no_payment');
    end if;
    for v_payment in select value from jsonb_array_elements(p_payments)
    loop
      v_paid_total := v_paid_total + (v_payment->>'amount')::numeric;
      v_payment_count := v_payment_count + 1;
    end loop;
    if v_paid_total < v_total then
      return jsonb_build_object('ok', false, 'error', 'insufficient_payment', 'total_amount', v_total);
    end if;
    if v_payment_count = 1 and (p_payments->0->>'method') = 'cash' then
      v_change := v_paid_total - v_total;
    elsif v_paid_total > v_total then
      -- Perbaikan #2: bedakan pesan error single-method non-cash vs. split
      -- sungguhan (>1 metode) — sebelumnya keduanya sama-sama
      -- 'overpayment_not_allowed_for_split', membingungkan utk kasus pertama.
      if v_payment_count = 1 then
        return jsonb_build_object('ok', false, 'error', 'overpayment_not_allowed_for_non_cash');
      else
        return jsonb_build_object('ok', false, 'error', 'overpayment_not_allowed_for_split');
      end if;
    end if;
  end if;

  v_sale_number := next_sale_number(p_business_id);

  insert into sales (
    business_id, location_id, staff_id, customer_id, customer_name, customer_phone,
    subtotal, discount_amount, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, status, idempotency_key, notes, sale_number
  ) values (
    p_business_id, p_location_id, p_staff_id, p_customer_id, p_customer_name, p_customer_phone,
    v_subtotal, coalesce(p_discount_amount, 0), coalesce(p_tax_amount, 0), v_total,
    p_payment_method,
    case when p_payment_method = 'piutang' then 0 else v_paid_total end,
    v_change,
    'completed', p_idempotency_key, p_notes, v_sale_number
  )
  returning id into v_sale_id;

  if p_payment_method = 'piutang' then
    update customers set balance = balance + v_total where id = p_customer_id;
  else
    for v_payment in select value from jsonb_array_elements(p_payments)
    loop
      insert into sale_payments (sale_id, business_id, payment_method, amount)
      values (v_sale_id, p_business_id, v_payment->>'method', (v_payment->>'amount')::numeric);
    end loop;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_item_discount := coalesce((v_item->>'discount_amount')::numeric, 0);

    select selling_price into v_unit_price from products where id = v_product_id and business_id = p_business_id;
    v_line_subtotal := (v_unit_price * v_quantity) - v_item_discount;

    insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, unit_price, total_value, staff_id, notes)
    values (p_business_id, v_product_id, p_location_id, 'keluar', v_quantity, v_unit_price, v_line_subtotal, p_staff_id, 'Penjualan POS ' || v_sale_number)
    returning id into v_txn_id;

    insert into sale_items (sale_id, business_id, product_id, quantity, unit_price, discount_amount, subtotal, stock_transaction_id)
    values (v_sale_id, p_business_id, v_product_id, v_quantity, v_unit_price, v_item_discount, v_line_subtotal, v_txn_id);

    update stock set quantity = quantity - v_quantity, last_updated_at = now()
      where business_id = p_business_id and product_id = v_product_id and location_id = p_location_id;
  end loop;

  return jsonb_build_object(
    'ok', true, 'sale_id', v_sale_id, 'sale_number', v_sale_number,
    'subtotal', v_subtotal, 'total_amount', v_total, 'change_amount', v_change
  );
end;
$$;
