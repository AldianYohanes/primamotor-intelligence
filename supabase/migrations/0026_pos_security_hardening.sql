-- 0026_pos_security_hardening.sql
--
-- Tiga perbaikan keamanan atas migration 0025 (POS v1), ditemukan saat review:
--
-- 1. record_sale SEBELUMNYA memakai unit_price yang dikirim client apa adanya.
--    UI kasir memang selalu isi otomatis dari katalog, tapi tidak ada apa pun
--    di server yang mencegah body request dimodifikasi (langsung panggil API,
--    devtools, dsb) untuk menjual produk dengan harga berapa pun. Diperbaiki
--    dengan cara paling aman: p_items->>'unit_price' dari client SEKARANG
--    DIABAIKAN SEPENUHNYA — RPC selalu ambil harga dari products.selling_price
--    di dalam transaksi yang sama. Bukan "validasi lalu tolak kalau beda",
--    tapi "harga dari client tidak pernah dipercaya sama sekali".
-- 2. Nomor nota sebelumnya cuma UUID (sales.id) — tidak cocok untuk pembukuan/
--    pajak yang butuh nomor urut. Ditambah sale_counters + next_sale_number()
--    untuk format INV/{tahun}/{urut 6 digit}, reset per tahun per tenant,
--    di-increment atomik DI DALAM record_sale (bukan pemanggilan terpisah —
--    supaya tidak ada celah antara "ambil nomor" dan "insert nota" yang bisa
--    menyebabkan nomor bolong/dobel kalau ada kegagalan di tengah).
-- 3. void_sale sebelumnya tidak punya batas waktu sama sekali. Sekarang
--    dibatasi 24 jam sejak nota dibuat untuk role 'admin'; role 'owner' (otoritas
--    tertinggi di tenant) tetap bisa void kapan saja untuk kasus koreksi yang
--    baru ditemukan belakangan.

-- ============================================================================
-- 1. Nomor nota urut
-- ============================================================================

create table if not exists sale_counters (
  business_id uuid not null references businesses(id),
  year int not null,
  counter bigint not null default 0,
  primary key (business_id, year)
);

-- security definer + search_path tetap (pola sama seperti RPC lain) supaya
-- bisa dipanggil dari dalam record_sale tanpa staf butuh akses langsung ke
-- sale_counters (tidak ada RLS di tabel ini sama sekali — akses HANYA lewat
-- fungsi ini, tidak pernah lewat .from('sale_counters') di Route Handler).
create or replace function next_sale_number(p_business_id uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_counter bigint;
begin
  insert into sale_counters (business_id, year, counter)
  values (p_business_id, v_year, 1)
  on conflict (business_id, year) do update set counter = sale_counters.counter + 1
  returning counter into v_counter;

  return 'INV/' || v_year || '/' || lpad(v_counter::text, 6, '0');
end;
$$;

alter table sales add column if not exists sale_number text;
create unique index if not exists sales_sale_number_uniq on sales (business_id, sale_number) where sale_number is not null;

-- ============================================================================
-- 2. record_sale — harga SELALU dari katalog, sertakan sale_number
-- ============================================================================
create or replace function record_sale(
  p_business_id uuid,
  p_location_id uuid,
  p_staff_id uuid,
  p_items jsonb, -- [{ product_id, quantity, discount_amount? }] — unit_price (kalau ada) diabaikan, lihat catatan di atas
  p_payment_method text,
  p_amount_paid numeric,
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
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_item_discount numeric;
  v_line_subtotal numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_available numeric;
  v_txn_id uuid;
begin
  if p_idempotency_key is not null then
    select id, sale_number into v_existing_sale_id, v_existing_sale_number
      from sales
      where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if v_existing_sale_id is not null then
      return jsonb_build_object('ok', true, 'sale_id', v_existing_sale_id, 'sale_number', v_existing_sale_number, 'idempotent_replay', true);
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_cart');
  end if;

  -- Tahap 1: kunci stok + AMBIL HARGA DARI KATALOG (bukan dari p_items) +
  -- validasi produk aktif, diurutkan product_id supaya locking konsisten.
  for v_item in
    select value from jsonb_array_elements(p_items) order by (value->>'product_id')
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_item_discount := coalesce((v_item->>'discount_amount')::numeric, 0);

    if v_quantity is null or v_quantity <= 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_quantity', 'product_id', v_product_id);
    end if;

    select selling_price into v_unit_price
      from products
      where id = v_product_id and business_id = p_business_id and is_active = true;
    if v_unit_price is null then
      return jsonb_build_object('ok', false, 'error', 'product_not_found_or_inactive', 'product_id', v_product_id);
    end if;

    select available_quantity into v_available
      from stock
      where business_id = p_business_id and product_id = v_product_id and location_id = p_location_id
      for update;
    if v_available is null or v_available < v_quantity then
      return jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'product_id', v_product_id);
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity) - v_item_discount;
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_discount_amount, 0) + coalesce(p_tax_amount, 0), 0);

  if p_payment_method = 'cash' and p_amount_paid < v_total then
    return jsonb_build_object('ok', false, 'error', 'insufficient_payment', 'total_amount', v_total);
  end if;

  v_sale_number := next_sale_number(p_business_id);

  insert into sales (
    business_id, location_id, staff_id, customer_name, customer_phone,
    subtotal, discount_amount, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, status, idempotency_key, notes, sale_number
  ) values (
    p_business_id, p_location_id, p_staff_id, p_customer_name, p_customer_phone,
    v_subtotal, coalesce(p_discount_amount, 0), coalesce(p_tax_amount, 0), v_total,
    p_payment_method, p_amount_paid,
    case when p_payment_method = 'cash' then greatest(p_amount_paid - v_total, 0) else 0 end,
    'completed', p_idempotency_key, p_notes, v_sale_number
  )
  returning id into v_sale_id;

  -- Tahap 2: insert baris — harga DIAMBIL ULANG dari katalog (bukan variabel
  -- tahap 1) supaya tidak ada asumsi urutan jsonb_array_elements yang sama
  -- persis antara dua loop; product_id tetap sumber kebenaran, bukan index array.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_item_discount := coalesce((v_item->>'discount_amount')::numeric, 0);

    select selling_price into v_unit_price from products where id = v_product_id and business_id = p_business_id;
    v_line_subtotal := (v_unit_price * v_quantity) - v_item_discount;

    insert into stock_transactions (
      business_id, product_id, location_id, transaction_type,
      quantity, unit_price, total_value, staff_id, notes
    ) values (
      p_business_id, v_product_id, p_location_id, 'keluar',
      v_quantity, v_unit_price, v_line_subtotal, p_staff_id,
      'Penjualan POS ' || v_sale_number
    )
    returning id into v_txn_id;

    insert into sale_items (
      sale_id, business_id, product_id, quantity, unit_price,
      discount_amount, subtotal, stock_transaction_id
    ) values (
      v_sale_id, p_business_id, v_product_id, v_quantity, v_unit_price,
      v_item_discount, v_line_subtotal, v_txn_id
    );

    update stock
      set quantity = quantity - v_quantity, last_updated_at = now()
      where business_id = p_business_id and product_id = v_product_id and location_id = p_location_id;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'subtotal', v_subtotal,
    'total_amount', v_total,
    'change_amount', case when p_payment_method = 'cash' then greatest(p_amount_paid - v_total, 0) else 0 end
  );
end;
$$;

-- ============================================================================
-- 3. void_sale — batas waktu 24 jam, owner bisa lewati
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
    insert into stock_transactions (
      business_id, product_id, location_id, transaction_type,
      quantity, unit_price, total_value, staff_id, notes, related_transaction_id
    ) values (
      v_sale.business_id, v_item.product_id, v_sale.location_id, 'retur',
      v_item.quantity, v_item.unit_price, v_item.subtotal, p_staff_id,
      coalesce('Void nota ' || v_sale.sale_number || ': ' || p_reason, 'Void nota ' || v_sale.sale_number), v_item.stock_transaction_id
    );

    update stock
      set quantity = quantity + v_item.quantity, last_updated_at = now()
      where business_id = v_sale.business_id and product_id = v_item.product_id and location_id = v_sale.location_id;
  end loop;

  update sales
    set status = 'voided', voided_by = p_staff_id, voided_at = now(), void_reason = p_reason
    where id = p_sale_id;

  return jsonb_build_object('ok', true);
end;
$$;
