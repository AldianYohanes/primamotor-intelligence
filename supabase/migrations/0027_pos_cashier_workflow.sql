-- 0027_pos_cashier_workflow.sql
--
-- Tiga penambahan alur kasir di atas migration 0025+0026:
--
-- 1. Split payment — satu nota bisa dibayar dengan kombinasi metode (mis.
--    separuh cash separuh transfer). Disimpan di tabel baru `sale_payments`
--    (satu baris per metode per nota), bukan menambah kolom di `sales`.
--    Kembalian (`change_amount`) HANYA dihitung kalau nota dibayar dengan
--    SATU metode 'cash' — kombinasi apa pun (termasuk cash+lainnya) TIDAK
--    menghasilkan kembalian, harus pas atau lebih (kelebihan pada split
--    dianggap tidak valid, ditolak). Ini pemotongan scope yang disengaja:
--    kembalian di skenario split (mis. "300rb cash + pas-pasan qris, kembalian
--    dari cash-nya") butuh alokasi per-metode yang lebih rumit dan jarang
--    dipakai di toko kecil — kalau nanti dibutuhkan, ini titik yang jelas
--    untuk diperluas.
-- 2. Piutang pelanggan (`customers` + `payment_method = 'piutang'`) — nota
--    bisa "dibayar nanti" ke pelanggan langganan (bengkel dsb) selama masih
--    di bawah credit_limit. `customers.credit_limit` DEFAULT 0 = pelanggan
--    itu TIDAK BOLEH piutang sama sekali (harus di-set eksplisit oleh
--    admin/owner) — supaya piutang bukan default yang gampang kebablasan.
--    `customer_payments` mencatat pelunasan (kurangi balance).
-- 3. record_sale & void_sale diganti total mengikuti struktur baru di atas
--    (tetap mempertahankan kuncian harga ke katalog dari migration 0026).

-- ============================================================================
-- 1. Tabel baru
-- ============================================================================

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  name text not null,
  phone text,
  -- 0 = tidak boleh piutang sama sekali (default aman). Admin/owner wajib
  -- set eksplisit lewat modul pelanggan kalau mau kasih akses kasbon.
  credit_limit numeric not null default 0,
  balance numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists customers_business_idx on customers (business_id);

create table if not exists sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  business_id uuid not null references businesses(id),
  payment_method text not null check (payment_method in ('cash', 'transfer', 'qris', 'card')),
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists sale_payments_sale_idx on sale_payments (sale_id);
create index if not exists sale_payments_business_idx on sale_payments (business_id);

create table if not exists customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  business_id uuid not null references businesses(id),
  staff_id uuid references staff(id),
  amount numeric not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'transfer', 'qris', 'card')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists customer_payments_customer_idx on customer_payments (customer_id);
create index if not exists customer_payments_business_idx on customer_payments (business_id);

alter table sales add column if not exists customer_id uuid references customers(id);
alter table sales drop constraint if exists sales_payment_method_check;
alter table sales add constraint sales_payment_method_check
  check (payment_method in ('cash', 'transfer', 'qris', 'card', 'split', 'piutang'));

-- ============================================================================
-- 2. RLS (pola standar §10 — sama seperti sales/sale_items)
-- ============================================================================

alter table customers enable row level security;
create policy customers_select on customers for select using (business_id = auth_business_id() or is_super_admin());
create policy customers_insert on customers for insert with check (business_id = auth_business_id() and is_full_access());
create policy customers_update on customers for update
  using (business_id = auth_business_id() and is_full_access())
  with check (business_id = auth_business_id() and is_full_access());

alter table sale_payments enable row level security;
create policy sale_payments_select on sale_payments for select using (business_id = auth_business_id() or is_super_admin());
create policy sale_payments_insert on sale_payments for insert with check (business_id = auth_business_id() and is_full_access());

alter table customer_payments enable row level security;
create policy customer_payments_select on customer_payments for select using (business_id = auth_business_id() or is_super_admin());
create policy customer_payments_insert on customer_payments for insert with check (business_id = auth_business_id() and is_full_access());

-- ============================================================================
-- 3. record_sale — ganti total: split payment + piutang, harga tetap terkunci ke katalog
-- ============================================================================
create or replace function record_sale(
  p_business_id uuid,
  p_location_id uuid,
  p_staff_id uuid,
  p_items jsonb, -- [{ product_id, quantity, discount_amount? }]
  p_payment_method text, -- 'cash' | 'transfer' | 'qris' | 'card' | 'split' | 'piutang'
  p_payments jsonb default null, -- [{ method, amount }] — wajib diisi kecuali payment_method='piutang'
  p_customer_id uuid default null, -- wajib kalau payment_method='piutang', opsional (link pelanggan terdaftar) untuk metode lain
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
    -- Kembalian HANYA utk satu metode 'cash' tunggal (lihat catatan scope di atas)
    if v_payment_count = 1 and (p_payments->0->>'method') = 'cash' then
      v_change := v_paid_total - v_total;
    elsif v_paid_total > v_total then
      return jsonb_build_object('ok', false, 'error', 'overpayment_not_allowed_for_split');
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

-- ============================================================================
-- 4. void_sale — kembalikan saldo piutang kalau nota itu piutang
-- ============================================================================
create or replace function void_sale(
  p_sale_id uuid,
  p_staff_id uuid,
  p_staff_role text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale sales%rowtype;
  v_item sale_items%rowtype;
begin
  select * into v_sale from sales where id = p_sale_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_sale.status = 'voided' then
    return jsonb_build_object('ok', false, 'error', 'already_voided');
  end if;
  if p_staff_role <> 'owner' and v_sale.created_at < now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', 'void_window_expired');
  end if;

  for v_item in select * from sale_items where sale_id = p_sale_id
  loop
    insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, unit_price, total_value, staff_id, notes, related_transaction_id)
    values (
      v_sale.business_id, v_item.product_id, v_sale.location_id, 'retur',
      v_item.quantity, v_item.unit_price, v_item.subtotal, p_staff_id,
      coalesce('Void nota ' || v_sale.sale_number || ': ' || p_reason, 'Void nota ' || v_sale.sale_number), v_item.stock_transaction_id
    );
    update stock set quantity = quantity + v_item.quantity, last_updated_at = now()
      where business_id = v_sale.business_id and product_id = v_item.product_id and location_id = v_sale.location_id;
  end loop;

  -- Catatan simplifikasi: kalau nota piutang ini sudah SEBAGIAN dilunasi lewat
  -- customer_payments sebelum di-void, balance dikurangi total_amount penuh
  -- apa adanya (bisa jadi negatif). customer_payments TIDAK dilink ke sale
  -- tertentu (sifatnya running balance/FIFO), jadi tidak ada cara aman untuk
  -- tahu porsi mana yang sudah dibayar. Kasus ini seharusnya jarang (staf
  -- manajer perlu cek manual dulu sebelum void nota piutang lama).
  if v_sale.payment_method = 'piutang' and v_sale.customer_id is not null then
    update customers set balance = balance - v_sale.total_amount where id = v_sale.customer_id;
  end if;

  update sales set status = 'voided', voided_by = p_staff_id, voided_at = now(), void_reason = p_reason
    where id = p_sale_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- 5. RPC: record_customer_payment — pelunasan piutang
-- ============================================================================
create or replace function record_customer_payment(
  p_business_id uuid,
  p_customer_id uuid,
  p_staff_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer customers%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  select * into v_customer from customers where id = p_customer_id and business_id = p_business_id for update;
  if v_customer.id is null then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  insert into customer_payments (customer_id, business_id, staff_id, amount, payment_method, notes)
  values (p_customer_id, p_business_id, p_staff_id, p_amount, p_payment_method, p_notes);

  update customers set balance = greatest(balance - p_amount, 0) where id = p_customer_id;

  return jsonb_build_object('ok', true, 'new_balance', greatest(v_customer.balance - p_amount, 0));
end;
$$;
