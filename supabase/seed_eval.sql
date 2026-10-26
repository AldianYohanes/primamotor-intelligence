-- seed_eval.sql — tenant terpisah untuk evaluasi Bab 4 (routing, tool calling, ETSR)
--
-- Kenapa tenant terpisah: skenario transaksi yang dikonfirmasi PIN benar-benar
-- mengubah stok. Data Prima Motor asli tidak boleh ikut berubah, dan hasil
-- evaluasi harus bisa diulang dari keadaan awal yang sama.
--
-- Nama produk diambil dari catatan observasi lapangan
-- (thesis-latex/datasets/prima-motor-observasi, 18 Sep 2026). Nomor part,
-- kuantitas, harga, dan riwayat penjualan di bawah SINTETIS — bukan data mitra.
--
-- Cara pakai:
--   1. Supabase Dashboard > Authentication > Add user:
--        email    : eval-prima-motor.evaluator@staff.internal
--        password : PIN evaluator (angka, minimal 6 digit)
--   2. Jalankan seluruh file ini di SQL editor.
--   3. Jalankan ulang file ini kapan saja untuk MERESET tenant ke keadaan awal
--      (semua produk, stok, percakapan, dan audit log eval dihapus lalu dibuat ulang).
--   4. Login di aplikasi: toko "eval-prima-motor", username "evaluator", PIN di atas.
--
-- Opsional — akun owner untuk portal admin (uji manual M4, mis. ubah stok lalu
-- cek cache offline /chat). Evaluator tetap role staf supaya kondisi run /eval
-- tidak berubah.
--   a. Supabase Dashboard > Authentication > Add user:
--        email    : eval-prima-motor.owner@staff.internal
--        password : PIN owner (angka, minimal 6 digit)
--   b. Jalankan (ulang) file ini; baris staf owner dibuat otomatis bila auth
--      user di atas ada, dan dilewati bila belum dibuat.
--   c. Login: toko "eval-prima-motor", username "owner", PIN owner.

begin;

do $$
begin
  if not exists (select 1 from auth.users where email = 'eval-prima-motor.evaluator@staff.internal') then
    raise exception 'Buat dulu auth user eval-prima-motor.evaluator@staff.internal (langkah 1)';
  end if;
end $$;

delete from businesses where id = 'e0000000-0000-0000-0000-00000000e001';

insert into businesses (id, name, slug, address, status) values
  ('e0000000-0000-0000-0000-00000000e001', 'Prima Motor (Evaluasi)', 'eval-prima-motor', 'Tenant uji, bukan toko nyata', 'active');

-- Koordinat sintetis (butuh migrasi 0035). Toko ≈ Blok M Square; Gudang ±2,5 km
-- ke selatan. Posisi perangkat tetap di /eval = koordinat Toko (lib/eval/tenant.ts).
insert into locations (id, business_id, name, type, latitude, longitude) values
  ('e0000000-0ca0-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000e001', 'Toko', 'toko', -6.2441, 106.8000),
  ('e0000000-0ca0-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000e001', 'Gudang', 'gudang', -6.2665, 106.8040);

insert into staff (id, business_id, auth_user_id, username, full_name, role)
select 'e0000000-5a1f-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000e001', u.id, 'evaluator', 'Evaluator Skripsi', 'staff'
from auth.users u
where u.email = 'eval-prima-motor.evaluator@staff.internal';

-- Owner opsional (lihat langkah a–c di atas); tidak ada baris bila auth user belum dibuat.
insert into staff (id, business_id, auth_user_id, username, full_name, role)
select 'e0000000-5a1f-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000e001', u.id, 'owner', 'Owner Evaluasi', 'owner'
from auth.users u
where u.email = 'eval-prima-motor.owner@staff.internal';

-- ============================================================
-- Produk. part_number EVAL-xxx dipakai scenarios.json sebagai referensi stabil.
-- ============================================================
insert into products (id, business_id, part_number, name, category, unit, min_threshold, unit_cost, selling_price) values
  ('e0000000-0d0c-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-001', 'Timing Belt Volvo 240 B230',            'Sabuk penggerak mesin', 'pcs',   3,  350000,  480000),
  ('e0000000-0d0c-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-002', 'V-Belt Alternator',                     'Sabuk penggerak mesin', 'pcs',   4,   90000,  135000),
  ('e0000000-0d0c-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-003', 'Radiator Volvo 240',                    'Sistem pendingin',      'unit',  1, 1800000, 2450000),
  ('e0000000-0d0c-0000-0000-000000000004', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-004', 'Kampas Rem Depan Brembo',               'Sistem pengereman',     'set',   4,  420000,  590000),
  ('e0000000-0d0c-0000-0000-000000000005', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-005', 'Bushing Arm Suspensi Depan',            'Suspensi/karet',        'pcs',   6,   75000,  115000),
  ('e0000000-0d0c-0000-0000-000000000006', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-006', 'Filter Oli Mahle',                      'Filter',                'pcs',  10,   65000,   95000),
  ('e0000000-0d0c-0000-0000-000000000007', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-007', 'Filter Udara Mahle',                    'Filter',                'pcs',   5,  110000,  160000),
  ('e0000000-0d0c-0000-0000-000000000008', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-008', 'Bilah Wiper Bosch 20 inch',             'Wiper',                 'pcs',   6,   80000,  125000),
  ('e0000000-0d0c-0000-0000-000000000009', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-009', 'Sabuk Multi-Rib Continental',           'Sabuk penggerak mesin', 'pcs',   3,  180000,  260000),
  ('e0000000-0d0c-0000-0000-000000000010', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-010', 'Oli Diferensial Limited-Slip',          'Cairan/pelumas',        'botol', 4,  140000,  195000),
  ('e0000000-0d0c-0000-0000-000000000011', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-011', 'Tangki Air Radiator Febi',              'Sistem pendingin',      'unit',  2,  650000,  880000),
  ('e0000000-0d0c-0000-0000-000000000012', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-012', 'Lampu Belakang Kiri Depo',              'Kelistrikan/pencahayaan','unit', 1,  550000,  760000),
  ('e0000000-0d0c-0000-0000-000000000013', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-013', 'Lampu Depan Hella Volvo 240',           'Kelistrikan/pencahayaan','unit', 1,  900000, 1250000),
  ('e0000000-0d0c-0000-0000-000000000014', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-014', 'Gril Depan Volvo 240',                  'Bodi/eksterior',        'unit',  1, 1200000, 1650000),
  ('e0000000-0d0c-0000-0000-000000000015', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-015', 'Mud Flap Belakang',                     'Bodi/eksterior',        'pasang',2,  150000,  220000),
  ('e0000000-0d0c-0000-0000-000000000016', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-016', 'Stoplamp Volvo 740',                    'Kelistrikan/pencahayaan','unit', 1,  600000,  840000),
  ('e0000000-0d0c-0000-0000-000000000017', 'e0000000-0000-0000-0000-00000000e001', 'EVAL-017', 'Karburator Volvo 240',                  'Bahan bakar',           'unit',  1, 2100000, 2900000);

-- Istilah informal staf → dipakai search_products (fuzzy trigram) untuk skenario parafrasa/typo
insert into product_aliases (product_id, alias, source) values
  ('e0000000-0d0c-0000-0000-000000000003', 'rediator',            'eval'),
  ('e0000000-0d0c-0000-0000-000000000004', 'brake pads',          'eval'),
  ('e0000000-0d0c-0000-0000-000000000004', 'kampas rem',          'eval'),
  ('e0000000-0d0c-0000-0000-000000000007', 'luftfilter',          'eval'),
  ('e0000000-0d0c-0000-0000-000000000007', 'saringan udara',      'eval'),
  ('e0000000-0d0c-0000-0000-000000000008', 'wiper',               'eval'),
  ('e0000000-0d0c-0000-0000-000000000009', 'multi v-belt',        'eval'),
  ('e0000000-0d0c-0000-0000-000000000009', 'keilrippenriemen',    'eval'),
  ('e0000000-0d0c-0000-0000-000000000010', 'oli gardan',          'eval'),
  ('e0000000-0d0c-0000-0000-000000000011', 'tank air radiator',   'eval'),
  ('e0000000-0d0c-0000-0000-000000000011', 'tabung air radiator', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000012', 'tail lamp kiri',      'eval'),
  ('e0000000-0d0c-0000-0000-000000000012', 'stop kiri',           'eval'),
  ('e0000000-0d0c-0000-0000-000000000013', 'headlamp',            'eval'),
  ('e0000000-0d0c-0000-0000-000000000014', 'grill',               'eval'),
  ('e0000000-0d0c-0000-0000-000000000015', 'pelindung lumpur',    'eval'),
  ('e0000000-0d0c-0000-0000-000000000017', 'karbu',               'eval'),
  ('e0000000-0d0c-0000-0000-000000000017', 'karburator',          'eval'),
  ('e0000000-0d0c-0000-0000-000000000001', 'cambelt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000001', 'cam belt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000002', 'fan belt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000002', 'tali kipas', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000002', 'fanbelt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000008', 'wiper blade', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000009', 'drive belt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000009', 'serpentine belt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000011', 'tabung cadangan radiator', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000011', 'coolant reservoir', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000013', 'lampu utama', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000014', 'grille', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000015', 'kepet', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000015', 'kepet spakbor', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000015', 'mudflap', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000016', 'stop lamp', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000016', 'lampu rem', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000017', 'carburator', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000017', 'carburetor', 'eval');

-- ============================================================
-- Stok akhir + riwayat keluar 6 bulan di Toko (untuk getSalesTrend).
-- Saldo `stock` dibentuk lewat ledger (trigger apply_stock_transaction),
-- sama seperti jalur produksi — bukan insert langsung ke tabel stock.
--   toko/gudang = saldo akhir yang diinginkan
--   s0..s5      = jumlah keluar per bulan, s0 = 5 bulan lalu, s5 = bulan ini
-- ============================================================
with plan (product_id, toko, gudang, s0, s1, s2, s3, s4, s5) as (
  values
    ('e0000000-0d0c-0000-0000-000000000001'::uuid,  6, 14, 2, 3, 2, 4, 3, 2),
    ('e0000000-0d0c-0000-0000-000000000002'::uuid,  8, 20, 3, 2, 4, 3, 5, 2),
    ('e0000000-0d0c-0000-0000-000000000003'::uuid,  2,  3, 0, 1, 0, 1, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000004'::uuid, 10, 16, 4, 5, 3, 6, 5, 4),
    ('e0000000-0d0c-0000-0000-000000000005'::uuid, 12, 30, 6, 4, 8, 5, 7, 3),
    ('e0000000-0d0c-0000-0000-000000000006'::uuid, 25, 60, 18, 22, 20, 25, 24, 12),
    ('e0000000-0d0c-0000-0000-000000000007'::uuid,  9, 15, 5, 6, 4, 7, 6, 3),
    ('e0000000-0d0c-0000-0000-000000000008'::uuid, 14, 20, 3, 5, 9, 11, 6, 4),
    ('e0000000-0d0c-0000-0000-000000000009'::uuid,  5,  7, 1, 2, 1, 2, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000010'::uuid,  4, 12, 2, 1, 2, 2, 1, 1),
    ('e0000000-0d0c-0000-0000-000000000011'::uuid,  1,  2, 1, 0, 1, 0, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000012'::uuid,  0,  4, 0, 1, 0, 0, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000013'::uuid,  3,  5, 1, 0, 1, 1, 0, 1),
    ('e0000000-0d0c-0000-0000-000000000014'::uuid,  1,  0, 0, 0, 1, 0, 0, 0),
    ('e0000000-0d0c-0000-0000-000000000015'::uuid,  6, 10, 1, 2, 1, 1, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000016'::uuid,  2,  2, 0, 1, 0, 0, 0, 1),
    ('e0000000-0d0c-0000-0000-000000000017'::uuid,  1,  1, 0, 0, 0, 1, 0, 0)
),
opening as (
  select product_id, 'e0000000-0ca0-0000-0000-000000000001'::uuid as location_id,
         toko + s0 + s1 + s2 + s3 + s4 + s5 as qty
  from plan
  union all
  select product_id, 'e0000000-0ca0-0000-0000-000000000002'::uuid, gudang
  from plan
)
insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, notes, created_at)
select 'e0000000-0000-0000-0000-00000000e001', product_id, location_id, 'masuk', qty,
       'Saldo awal tenant evaluasi', date_trunc('month', now()) - interval '6 months'
from opening
where qty > 0;

with plan (product_id, s0, s1, s2, s3, s4, s5) as (
  values
    ('e0000000-0d0c-0000-0000-000000000001'::uuid, 2, 3, 2, 4, 3, 2),
    ('e0000000-0d0c-0000-0000-000000000002'::uuid, 3, 2, 4, 3, 5, 2),
    ('e0000000-0d0c-0000-0000-000000000003'::uuid, 0, 1, 0, 1, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000004'::uuid, 4, 5, 3, 6, 5, 4),
    ('e0000000-0d0c-0000-0000-000000000005'::uuid, 6, 4, 8, 5, 7, 3),
    ('e0000000-0d0c-0000-0000-000000000006'::uuid, 18, 22, 20, 25, 24, 12),
    ('e0000000-0d0c-0000-0000-000000000007'::uuid, 5, 6, 4, 7, 6, 3),
    ('e0000000-0d0c-0000-0000-000000000008'::uuid, 3, 5, 9, 11, 6, 4),
    ('e0000000-0d0c-0000-0000-000000000009'::uuid, 1, 2, 1, 2, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000010'::uuid, 2, 1, 2, 2, 1, 1),
    ('e0000000-0d0c-0000-0000-000000000011'::uuid, 1, 0, 1, 0, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000012'::uuid, 0, 1, 0, 0, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000013'::uuid, 1, 0, 1, 1, 0, 1),
    ('e0000000-0d0c-0000-0000-000000000014'::uuid, 0, 0, 1, 0, 0, 0),
    ('e0000000-0d0c-0000-0000-000000000015'::uuid, 1, 2, 1, 1, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000016'::uuid, 0, 1, 0, 0, 0, 1),
    ('e0000000-0d0c-0000-0000-000000000017'::uuid, 0, 0, 0, 1, 0, 0)
),
monthly as (
  select product_id, m.months_ago, m.qty
  from plan,
  lateral (values (5, s0), (4, s1), (3, s2), (2, s3), (1, s4), (0, s5)) as m(months_ago, qty)
)
insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, notes, created_at)
select 'e0000000-0000-0000-0000-00000000e001', product_id, 'e0000000-0ca0-0000-0000-000000000001', 'keluar', qty,
       'Riwayat penjualan sintetis (evaluasi)',
       least(date_trunc('month', now()) - make_interval(months => months_ago) + interval '9 days', now() - interval '1 hour')
from monthly
where qty > 0
order by months_ago desc;

commit;

-- Pemeriksaan cepat: harus 17 produk, dan saldo Toko/Gudang sesuai kolom toko/gudang di atas.
select p.part_number, p.name, l.name as lokasi, s.quantity, s.available_quantity
from stock s
join products p on p.id = s.product_id
join locations l on l.id = s.location_id
where s.business_id = 'e0000000-0000-0000-0000-00000000e001'
order by p.part_number, l.name;
