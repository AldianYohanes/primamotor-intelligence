-- 0031_dynamic_reorder_point.sql
--
-- Menambahkan parameter ROP per produk dan dua agregasi deterministik:
-- 1. get_sales_trend tetap mengembalikan data bulanan dengan bentuk yang sama,
--    tetapi bulan tanpa transaksi sekarang muncul dengan total_keluar = 0.
-- 2. get_outbound_total menghitung total barang keluar pada jendela rolling
--    sejumlah hari untuk kalkulasi rata-rata harian Monitoring Agent.

alter table products
  add column lead_time_days int not null default 0 check (lead_time_days >= 0),
  add column safety_stock int not null default 0 check (safety_stock >= 0);

comment on column products.lead_time_days is
  'Asumsi waktu tunggu pengadaan produk dalam hari untuk kalkulasi Reorder Point.';
comment on column products.safety_stock is
  'Stok pengaman produk untuk menyerap variasi permintaan dan keterlambatan pengadaan.';

create or replace function get_sales_trend(p_product_id uuid, p_months int)
returns table(period date, total_keluar int) as $$
  with month_series as (
    select generate_series(
      date_trunc('month', now()) - (greatest(p_months, 1) - 1) * interval '1 month',
      date_trunc('month', now()),
      interval '1 month'
    )::date as period
  ),
  outbound as (
    select date_trunc('month', created_at)::date as period,
           sum(quantity)::int as total_keluar
    from stock_transactions
    where product_id = p_product_id
      and transaction_type = 'keluar'
      and created_at >= date_trunc('month', now())
        - (greatest(p_months, 1) - 1) * interval '1 month'
    group by 1
  )
  select months.period, coalesce(outbound.total_keluar, 0)::int
  from month_series months
  left join outbound using (period)
  order by months.period;
$$ language sql stable;

create or replace function get_outbound_total(p_product_id uuid, p_days int)
returns int as $$
  select coalesce(sum(quantity), 0)::int
  from stock_transactions
  where product_id = p_product_id
    and transaction_type = 'keluar'
    and created_at >= now() - make_interval(days => greatest(p_days, 1));
$$ language sql stable;
