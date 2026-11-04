-- T2b — apakah SECURITY DEFINER record_sale memeriksa pemanggil? (lokal, semua di-ROLLBACK)
-- Karena record_sale rusak di PG asli (menulis kolom generated total_value), sifat
-- generated dilepas SEMENTARA di dalam transaksi ini agar pemeriksaan otorisasi bisa diuji.
begin;
alter table stock_transactions alter column total_value drop expression;

-- Kondisi awal tenant B
select 'sebelum' as saat, (select quantity from stock where product_id='b0000000-0d0c-0000-0000-000000000001') stok_B,
       (select count(*) from sales where business_id='b0000000-0000-0000-0000-00000000b001') penjualan_B;

-- ANON menjual barang milik tenant B atas nama staf tenant A
set local role anon;
select record_sale(
  p_business_id := 'b0000000-0000-0000-0000-00000000b001',
  p_location_id := 'b0000000-0ca0-0000-0000-000000000001',
  p_staff_id    := 'e0000000-5a1f-0000-0000-000000000001',
  p_items       := '[{"product_id":"b0000000-0d0c-0000-0000-000000000001","quantity":2}]'::jsonb,
  p_payment_method := 'cash',
  p_payments    := '[{"method":"cash","amount":100000}]'::jsonb
) as hasil_anon;
reset role;

select 'sesudah' as saat, (select quantity from stock where product_id='b0000000-0d0c-0000-0000-000000000001') stok_B,
       (select count(*) from sales where business_id='b0000000-0000-0000-0000-00000000b001') penjualan_B;
rollback;
