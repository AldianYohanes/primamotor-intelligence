-- 0025_pos_sales.sql
--
-- Fitur POS (kasir): nota penjualan multi-item ("sales" + "sale_items"),
-- terpisah dari stock_transactions mentah karena kasir butuh konsep NOTA
-- (satu struk = banyak baris produk, satu metode bayar, satu kembalian) —
-- bukan cuma satu baris keluar per produk seperti alur chat agent (§7).
--
-- Setiap baris sale_items TETAP menghasilkan satu baris stock_transactions
-- (transaction_type 'keluar') supaya ledger stok yang sudah ada (dipakai
-- get-sales-trend, monitoring agent, dsb) otomatis ikut mencatat penjualan
-- dari POS tanpa perlu logika terpisah di tempat lain — sale_items.stock_transaction_id
-- adalah link balik ke baris itu.

-- ============================================================================
-- 1. TABEL
-- ============================================================================

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  location_id uuid not null references locations(id),
  staff_id uuid references staff(id),
  customer_name text,
  customer_phone text,
  subtotal numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  payment_method text not null check (payment_method in ('cash', 'transfer', 'qris', 'card')),
  amount_paid numeric not null default 0,
  change_amount numeric not null default 0,
  status text not null default 'completed' check (status in ('completed', 'voided')),
  voided_by uuid references staff(id),
  voided_at timestamptz,
  void_reason text,
  -- Idempotency key dibuat client-side (crypto.randomUUID()) sekali per sesi
  -- checkout — kalau POST /api/admin/pos/sales di-retry (mis. jaringan kasir
  -- putus di tengah, staf klik ulang), record_sale() mengembalikan nota yang
  -- SAMA alih-alih dobel-catat penjualan & dobel-potong stok (§9 pola idempotency).
  idempotency_key text,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists sales_idempotency_key_uniq
  on sales (business_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists sales_business_created_idx on sales (business_id, created_at desc);
create index if not exists sales_business_status_idx on sales (business_id, status);
create index if not exists sales_business_staff_idx on sales (business_id, staff_id);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  -- business_id didenormalisasi dari sales.business_id (bukan cuma join lewat
  -- sale_id) supaya RLS di tabel ini bisa langsung pakai auth_business_id()
  -- tanpa subquery ke sales tiap baris — konsisten dengan pola stock_transactions
  -- yang juga menyimpan business_id langsung, bukan cuma via relasi.
  business_id uuid not null references businesses(id),
  product_id uuid not null references products(id),
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  discount_amount numeric not null default 0,
  subtotal numeric not null,
  -- Link balik ke ledger stock_transactions (satu baris per sale_item) — dipakai
  -- void_sale() untuk tahu berapa & produk apa yang harus dikembalikan, dan untuk
  -- audit trail "transaksi stok ini berasal dari nota POS mana".
  stock_transaction_id uuid references stock_transactions(id),
  created_at timestamptz not null default now()
);

create index if not exists sale_items_sale_idx on sale_items (sale_id);
create index if not exists sale_items_business_idx on sale_items (business_id);
create index if not exists sale_items_product_idx on sale_items (product_id);

-- ============================================================================
-- 2. RLS
-- ============================================================================
-- Pola standar §10: baca = tenant sendiri ATAU super_admin; tulis = tenant
-- sendiri DAN is_full_access(), kecuali super_admin. Perlu dicatat: mutasi
-- sesungguhnya (checkout, void) TIDAK lewat RLS ini — dieksekusi via
-- createAdminClient() di Route Handler SETELAH requireStaff() (pola §5),
-- sama seperti record_stock_transaction/confirm_update_stock. RLS di sini
-- adalah lapisan pertahanan kedua (defense-in-depth) untuk query langsung,
-- bukan satu-satunya penjaga.

alter table sales enable row level security;
alter table sale_items enable row level security;

create policy sales_select on sales
  for select
  using (business_id = auth_business_id() or is_super_admin());

create policy sales_insert on sales
  for insert
  with check (business_id = auth_business_id() and is_full_access());

create policy sales_update on sales
  for update
  using (business_id = auth_business_id() and is_full_access())
  with check (business_id = auth_business_id() and is_full_access());

create policy sale_items_select on sale_items
  for select
  using (business_id = auth_business_id() or is_super_admin());

create policy sale_items_insert on sale_items
  for insert
  with check (business_id = auth_business_id() and is_full_access());

-- Sengaja TIDAK ada policy UPDATE/DELETE untuk sale_items — baris nota yang
-- sudah tercatat tidak pernah diedit langsung (void_sale menambah baris
-- stock_transactions 'retur' baru, bukan mengubah sale_items lama). Ini
-- menjaga sale_items tetap jadi catatan historis yang immutable.

-- ============================================================================
-- 3. RPC: record_sale — checkout atomik multi-item
-- ============================================================================
-- p_items: jsonb array [{ "product_id": uuid, "quantity": number,
--                          "unit_price": number, "discount_amount"?: number }]
--
-- Pola return { ok, ... } (bukan RAISE EXCEPTION untuk kondisi bisnis yang
-- DIHARAPKAN bisa terjadi — stok kurang, pembayaran cash kurang, keranjang
-- kosong) konsisten dengan confirm_update_stock/confirm_transfer_stock (migration
-- 0024) — supaya Route Handler bisa translate ke pesan Indonesia tanpa parsing
-- SQLSTATE. Error Postgres yang TIDAK terduga (constraint violation dsb) tetap
-- propagate sebagai exception normal → muncul sebagai `error` di sisi supabase-js.
create or replace function record_sale(
  p_business_id uuid,
  p_location_id uuid,
  p_staff_id uuid,
  p_items jsonb,
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
  v_existing_sale_id uuid;
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
    select id into v_existing_sale_id
      from sales
      where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if v_existing_sale_id is not null then
      return jsonb_build_object('ok', true, 'sale_id', v_existing_sale_id, 'idempotent_replay', true);
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_cart');
  end if;

  -- Tahap 1: kunci + validasi ketersediaan SEMUA baris dulu (all-or-nothing),
  -- diurutkan pakai product_id supaya urutan locking konsisten lintas transaksi
  -- checkout yang berbarengan di lokasi yang sama (mencegah deadlock FOR UPDATE).
  for v_item in
    select value from jsonb_array_elements(p_items) order by (value->>'product_id')
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    if v_quantity is null or v_quantity <= 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_quantity', 'product_id', v_product_id);
    end if;

    select available_quantity into v_available
      from stock
      where business_id = p_business_id and product_id = v_product_id and location_id = p_location_id
      for update;

    if v_available is null or v_available < v_quantity then
      return jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'product_id', v_product_id);
    end if;

    v_subtotal := v_subtotal + ((v_item->>'unit_price')::numeric * v_quantity) - coalesce((v_item->>'discount_amount')::numeric, 0);
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_discount_amount, 0) + coalesce(p_tax_amount, 0), 0);

  if p_payment_method = 'cash' and p_amount_paid < v_total then
    return jsonb_build_object('ok', false, 'error', 'insufficient_payment', 'total_amount', v_total);
  end if;

  -- Tahap 2: semua validasi lolos — mulai tulis. insert sales dulu (butuh
  -- v_sale_id sebagai FK sebelum insert sale_items/stock_transactions).
  insert into sales (
    business_id, location_id, staff_id, customer_name, customer_phone,
    subtotal, discount_amount, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, status, idempotency_key, notes
  ) values (
    p_business_id, p_location_id, p_staff_id, p_customer_name, p_customer_phone,
    v_subtotal, coalesce(p_discount_amount, 0), coalesce(p_tax_amount, 0), v_total,
    p_payment_method, p_amount_paid,
    case when p_payment_method = 'cash' then greatest(p_amount_paid - v_total, 0) else 0 end,
    'completed', p_idempotency_key, p_notes
  )
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_item_discount := coalesce((v_item->>'discount_amount')::numeric, 0);
    v_line_subtotal := (v_unit_price * v_quantity) - v_item_discount;

    -- Ledger stok — SATU baris 'keluar' per produk, dilink balik dari
    -- sale_items.stock_transaction_id di bawah.
    insert into stock_transactions (
      business_id, product_id, location_id, transaction_type,
      quantity, unit_price, total_value, staff_id, notes
    ) values (
      p_business_id, v_product_id, p_location_id, 'keluar',
      v_quantity, v_unit_price, v_line_subtotal, p_staff_id,
      'Penjualan POS'
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
    'subtotal', v_subtotal,
    'total_amount', v_total,
    'change_amount', case when p_payment_method = 'cash' then greatest(p_amount_paid - v_total, 0) else 0 end
  );
end;
$$;

-- ============================================================================
-- 4. RPC: void_sale — batalkan nota, kembalikan stok
-- ============================================================================
-- Dipanggil SETELAH reconfirmPin() sukses di Route Handler (pola §8, sama
-- seperti confirm_update_stock) dan setelah role staf dicek admin/owner
-- (void mengubah uang & stok mundur — bukan aksi kasir harian biasa).
--
-- Stok dikembalikan lewat baris stock_transactions BARU bertipe 'retur'
-- (bukan menghapus/mengedit baris 'keluar' asli) — ledger tetap append-only,
-- konsisten dengan prinsip stock_transactions di seluruh app.
create or replace function void_sale(
  p_sale_id uuid,
  p_staff_id uuid,
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

  for v_item in select * from sale_items where sale_id = p_sale_id
  loop
    insert into stock_transactions (
      business_id, product_id, location_id, transaction_type,
      quantity, unit_price, total_value, staff_id, notes, related_transaction_id
    ) values (
      v_sale.business_id, v_item.product_id, v_sale.location_id, 'retur',
      v_item.quantity, v_item.unit_price, v_item.subtotal, p_staff_id,
      coalesce('Void nota POS: ' || p_reason, 'Void nota POS'), v_item.stock_transaction_id
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
