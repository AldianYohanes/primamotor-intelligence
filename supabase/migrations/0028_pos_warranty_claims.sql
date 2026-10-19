-- 0028_pos_warranty_claims.sql
--
-- Garansi/retur per-item — beda dari void_sale (migration 0025/0026) yang
-- membatalkan SELURUH nota dalam 24 jam. Klaim garansi menangani kasus lain:
-- pelanggan balik BEBERAPA HARI/MINGGU kemudian karena satu part cacat,
-- sementara item lain di nota yang sama tidak bermasalah dan pembayaran tidak
-- perlu dibongkar ulang. Klaim garansi HANYA mengembalikan stok item yang
-- diklaim (via stock_transactions 'retur') dan mencatat resolusinya
-- (diganti/dikembalikan uang/diperbaiki) — TIDAK menyentuh sales.total_amount
-- atau status nota. Pengembalian uang (kalau resolusinya 'refunded') sengaja
-- ditangani MANUAL oleh toko di luar sistem (dicatat di `notes`), bukan
-- otomatis mengubah pembukuan — beda kasus dengan void yang memang
-- membatalkan seluruh transaksi finansial.

alter table products add column if not exists warranty_days int;
-- null = tidak ada garansi dilacak utk produk ini (default, aman — sama
-- prinsipnya dengan customers.credit_limit default 0: fitur baru tidak
-- otomatis aktif ke semua data lama, harus di-set eksplisit per produk).

create table if not exists warranty_claims (
  id uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null references sale_items(id),
  business_id uuid not null references businesses(id),
  staff_id uuid references staff(id),
  reason text not null,
  resolution text not null check (resolution in ('replaced', 'refunded', 'repaired')),
  notes text,
  created_at timestamptz not null default now()
);
-- Satu sale_item cuma boleh diklaim SEKALI — mencegah dobel-restock dari
-- klaim yang diajukan berulang utk barang yang sama.
create unique index if not exists warranty_claims_sale_item_uniq on warranty_claims (sale_item_id);
create index if not exists warranty_claims_business_idx on warranty_claims (business_id);

alter table warranty_claims enable row level security;
create policy warranty_claims_select on warranty_claims for select using (business_id = auth_business_id() or is_super_admin());
create policy warranty_claims_insert on warranty_claims for insert with check (business_id = auth_business_id() and is_full_access());

-- ============================================================================
-- RPC: claim_warranty_return
-- ============================================================================
create or replace function claim_warranty_return(
  p_business_id uuid,
  p_sale_item_id uuid,
  p_staff_id uuid,
  p_reason text,
  p_resolution text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, unit_price, total_value, staff_id, notes, related_transaction_id)
    values (
      p_business_id, v_item.product_id, v_sale.location_id, 'retur',
      v_item.quantity, v_item.unit_price, v_item.subtotal, p_staff_id,
      'Klaim garansi nota ' || coalesce(v_sale.sale_number, v_sale.id::text) || ': ' || p_reason,
      v_item.stock_transaction_id
    );
    update stock set quantity = quantity + v_item.quantity, last_updated_at = now()
      where business_id = p_business_id and product_id = v_item.product_id and location_id = v_sale.location_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
