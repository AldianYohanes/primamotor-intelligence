-- Uji agregasi rolling 90 hari dan zero-fill tren bulanan.
-- Jalankan setelah seluruh migration diterapkan. Semua fixture di-rollback.

begin;

insert into businesses (id, name, slug, status)
values (
  '91000000-0000-0000-0000-000000000001',
  'Fixture ROP',
  'fixture-rop-test',
  'active'
);

insert into locations (id, business_id, name, type)
values (
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000001',
  'Gudang Uji',
  'gudang'
);

insert into products (
  id, business_id, part_number, name, min_threshold,
  lead_time_days, safety_stock
)
values
  (
    '91000000-0000-0000-0000-000000000003',
    '91000000-0000-0000-0000-000000000001',
    'ROP-TEST-01', 'Produk Rolling', 5, 14, 4
  ),
  (
    '91000000-0000-0000-0000-000000000004',
    '91000000-0000-0000-0000-000000000001',
    'ROP-TEST-02', 'Produk Tanpa Transaksi', 0, 0, 0
  );

-- Saldo awal: sejak migrasi 0033, transaksi keluar tanpa saldo stok ditolak.
insert into stock_transactions (
  business_id, product_id, location_id, transaction_type, quantity, created_at
)
values (
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000003',
  '91000000-0000-0000-0000-000000000002',
  'masuk', 1000, now() - interval '120 days'
);

insert into stock_transactions (
  business_id, product_id, location_id, transaction_type, quantity, created_at
)
values
  (
    '91000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000003',
    '91000000-0000-0000-0000-000000000002',
    'keluar', 5, now() - interval '10 days'
  ),
  (
    '91000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000003',
    '91000000-0000-0000-0000-000000000002',
    'keluar', 7, now() - interval '89 days'
  ),
  (
    '91000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000003',
    '91000000-0000-0000-0000-000000000002',
    'keluar', 100, now() - interval '91 days'
  );

do $$
declare
  rolling_total int;
  month_count int;
  nonzero_month_count int;
begin
  select get_outbound_total(
    '91000000-0000-0000-0000-000000000003', 90
  ) into rolling_total;

  if rolling_total <> 12 then
    raise exception
      'Rolling 90 hari seharusnya 12 (5 + 7), tetapi menghasilkan %',
      rolling_total;
  end if;

  select count(*), count(*) filter (where total_keluar <> 0)
  into month_count, nonzero_month_count
  from get_sales_trend(
    '91000000-0000-0000-0000-000000000004', 3
  );

  if month_count <> 3 or nonzero_month_count <> 0 then
    raise exception
      'Tren produk kosong harus tetap memiliki 3 bulan bernilai nol';
  end if;
end;
$$;

rollback;
