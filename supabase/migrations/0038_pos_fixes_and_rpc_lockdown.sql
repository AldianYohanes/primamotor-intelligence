-- 0038_pos_fixes_and_rpc_lockdown.sql
--
-- Ditemukan lewat tes integrasi pada PostgreSQL/Supabase lokal (Okt 2026).
--
-- BUG 1 — record_sale / void_sale / claim_warranty_return menulis kolom
-- stock_transactions.total_value, padahal kolom itu GENERATED (0011:
-- quantity * coalesce(unit_price, 0)). PostgreSQL menolak: SQLSTATE 428C9.
-- Akibatnya alur POS tidak berjalan di PostgreSQL asli.
--
-- BUG 2 — di fungsi yang sama, setelah insert ke stock_transactions ada
-- `update stock` manual, padahal trigger apply_stock_transaction (0012/0033)
-- sudah mengubah stok. Stok berubah dua kali (jual 2 unit => stok turun 4;
-- void/klaim garansi => stok naik dua kali). Selama BUG 1 aktif, ini tidak
-- pernah terlihat karena fungsi gagal lebih dulu.
-- Catatan: total_value kini otomatis quantity * unit_price, sehingga potongan
-- per item (discount_amount) tidak tercermin di total_value; subtotal sebenarnya
-- tetap tersimpan di sale_items.subtotal.
--
-- BUG 3 — fungsi SECURITY DEFINER POS (record_sale, void_sale,
-- claim_warranty_return, record_customer_payment, next_sale_number) menerima
-- p_business_id dari parameter tanpa memeriksa pemanggil, dan EXECUTE-nya
-- terbuka untuk anon/authenticated (bawaan Supabase). Lewat /rest/v1/rpc/...
-- siapa pun dapat memutasi data tenant mana pun. Semua pemanggil sah di aplikasi
-- memakai admin client (service_role), jadi EXECUTE dicabut dari
-- PUBLIC/anon/authenticated dan diberikan hanya ke service_role.
-- RPC stok (invoker) sudah ditahan RLS, tetapi dicabut juga sebagai
-- defense in depth.
--
-- BUG 4 — sale_counters tanpa RLS dan dengan grant penuh ke anon/authenticated.
--
-- Overload lama record_sale (11 argumen) dan void_sale (3 argumen) tidak lagi
-- dipanggil aplikasi dan tidak diperbaiki; hanya dicabut aksesnya. Hapus
-- sepenuhnya bila sudah dipastikan tidak dipakai.

CREATE OR REPLACE FUNCTION public.record_sale(p_business_id uuid, p_location_id uuid, p_staff_id uuid, p_items jsonb, p_payment_method text, p_payments jsonb DEFAULT NULL::jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_discount_amount numeric DEFAULT 0, p_tax_amount numeric DEFAULT 0, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, unit_price, staff_id, notes)
    values (p_business_id, v_product_id, p_location_id, 'keluar', v_quantity, v_unit_price, p_staff_id, 'Penjualan POS ' || v_sale_number)
    returning id into v_txn_id;

    insert into sale_items (sale_id, business_id, product_id, quantity, unit_price, discount_amount, subtotal, stock_transaction_id)
    values (v_sale_id, p_business_id, v_product_id, v_quantity, v_unit_price, v_item_discount, v_line_subtotal, v_txn_id);

  end loop;

  return jsonb_build_object(
    'ok', true, 'sale_id', v_sale_id, 'sale_number', v_sale_number,
    'subtotal', v_subtotal, 'total_amount', v_total, 'change_amount', v_change
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id uuid, p_staff_id uuid, p_staff_role text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, unit_price, staff_id, notes, related_transaction_id)
    values (
      v_sale.business_id, v_item.product_id, v_sale.location_id, 'retur',
      v_item.quantity, v_item.unit_price, p_staff_id,
      coalesce('Void nota ' || v_sale.sale_number || ': ' || p_reason, 'Void nota ' || v_sale.sale_number), v_item.stock_transaction_id
    );
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_warranty_return(p_business_id uuid, p_sale_item_id uuid, p_staff_id uuid, p_reason text, p_resolution text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item sale_items%rowtype;
  v_sale sales%rowtype;
  v_warranty_days int;
  v_existing_claim uuid;
begin
  select * into v_item from sale_items where id = p_sale_item_id and business_id = p_business_id;
  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error', 'item_not_found');
  end if;

  select id into v_existing_claim from warranty_claims where sale_item_id = p_sale_item_id;
  if v_existing_claim is not null then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  select * into v_sale from sales where id = v_item.sale_id;
  if v_sale.status = 'voided' then
    return jsonb_build_object('ok', false, 'error', 'sale_voided');
  end if;

  select warranty_days into v_warranty_days from products where id = v_item.product_id;
  if v_warranty_days is null then
    return jsonb_build_object('ok', false, 'error', 'no_warranty');
  end if;
  if now() > v_sale.created_at + (v_warranty_days || ' days')::interval then
    return jsonb_build_object('ok', false, 'error', 'warranty_expired');
  end if;

  insert into warranty_claims (sale_item_id, business_id, staff_id, reason, resolution, notes)
  values (p_sale_item_id, p_business_id, p_staff_id, p_reason, p_resolution, null);

  -- Stok dikembalikan utk resolusi 'replaced' (barang cacat ditukar unit baru,
  -- unit cacat keluar dari peredaran tapi slot stok tetap terisi via 'retur'
  -- lalu toko proses penukaran fisik di luar sistem) DAN 'refunded' (barang
  -- balik ke toko). 'repaired' TIDAK mengembalikan stok — barang tetap di
  -- tangan pelanggan, cuma diperbaiki.
  if p_resolution in ('replaced', 'refunded') then
    insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, unit_price, staff_id, notes, related_transaction_id)
    values (
      p_business_id, v_item.product_id, v_sale.location_id, 'retur',
      v_item.quantity, v_item.unit_price, p_staff_id,
      'Klaim garansi nota ' || coalesce(v_sale.sale_number, v_sale.id::text) || ': ' || p_reason,
      v_item.stock_transaction_id
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

-- ============================================================
-- Cabut EXECUTE dari PUBLIC/anon/authenticated; beri ke service_role saja
-- ============================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'record_sale', 'void_sale', 'claim_warranty_return',
        'record_customer_payment', 'next_sale_number',
        'record_stock_transaction', 'transfer_stock',
        'reserve_stock', 'release_reservation',
        'expire_stale_pending_reservations',
        'confirm_update_stock', 'confirm_transfer_stock',
        'get_outbound_total'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- approve/reject_business_signup memeriksa is_super_admin() di dalam; anon tidak
-- punya alasan memanggilnya.
revoke execute on function approve_business_signup(uuid) from public, anon;
revoke execute on function reject_business_signup(uuid, text) from public, anon;
grant execute on function approve_business_signup(uuid) to authenticated, service_role;
grant execute on function reject_business_signup(uuid, text) to authenticated, service_role;

-- ============================================================
-- sale_counters: hanya diakses lewat next_sale_number (SECURITY DEFINER)
-- ============================================================
alter table sale_counters enable row level security;
revoke all on sale_counters from public, anon, authenticated;
