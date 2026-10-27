-- seed_eval.sql — tenant terpisah untuk evaluasi Bab 4 (routing, tool calling, ETSR)
--
-- Kenapa tenant terpisah: skenario transaksi yang dikonfirmasi PIN benar-benar
-- mengubah stok. Data Prima Motor asli tidak boleh ikut berubah, dan hasil
-- evaluasi harus bisa diulang dari keadaan awal yang sama.
--
-- Nama produk dari catatan observasi lapangan (thesis-latex/datasets/prima-motor-observasi, 18 Sep 2026).
-- Nomor part, merek, dan kompatibilitas dari riset web terbuka (volvo-classic-parts-brand-research.csv,
-- 28 Sep 2026). Kuantitas, harga, dan riwayat penjualan SINTETIS: pemilik toko tidak mengizinkan
-- pengumpulan data, jadi bukan data mitra.
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
  ('e0000000-0000-0000-0000-00000000e001', 'Prima Motor Volvo', 'eval-prima-motor', 'Lantai 3A, Blok M Square, Jakarta Selatan', 'active');

-- Koordinat sintetis (butuh migrasi 0035). Toko ≈ Blok M Square; Gudang ±2,5 km
-- ke selatan. Posisi perangkat tetap di /eval = koordinat Toko (lib/eval/tenant.ts).
insert into locations (id, business_id, name, type, latitude, longitude) values
  ('e0000000-0ca0-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000e001', 'Toko', 'toko', -6.2441, 106.8000),
  ('e0000000-0ca0-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000e001', 'Gudang', 'gudang', -6.2665, 106.8040);

insert into staff (id, business_id, auth_user_id, username, full_name, role)
select 'e0000000-5a1f-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000e001', u.id, 'evaluator', 'Staf Prima Motor', 'staff'
from auth.users u
where u.email = 'eval-prima-motor.evaluator@staff.internal';

-- Owner opsional (lihat langkah a–c di atas); tidak ada baris bila auth user belum dibuat.
insert into staff (id, business_id, auth_user_id, username, full_name, role)
select 'e0000000-5a1f-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000e001', u.id, 'owner', 'Owner Prima Motor', 'owner'
from auth.users u
where u.email = 'eval-prima-motor.owner@staff.internal';

-- ============================================================
-- Produk. part_number adalah nomor part asli (riset web terbuka); scenarios.json merujuknya.
-- ============================================================
insert into products (id, business_id, part_number, name, category, unit, min_threshold, unit_cost, selling_price, description) values
  ('e0000000-0d0c-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000e001', '271747', 'Timing Belt Volvo 240 B230', 'Sabuk penggerak mesin', 'pcs', 3, 350000, 480000, 'Continental. Kompatibel: Volvo 240/940. Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-engine-timing-belt-940-240-continental-tb234'),
  ('e0000000-0d0c-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000e001', '981680', 'V-Belt Alternator', 'Sabuk penggerak mesin', 'pcs', 4, 90000, 135000, 'Continental. Kompatibel: Volvo 940/740/760/780/745. Nomor part dari riset web terbuka: https://www.ebay.com/itm/126374848500'),
  ('e0000000-0d0c-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000e001', '5003505', 'Radiator Volvo 240', 'Sistem pendingin', 'unit', 1, 1800000, 2450000, 'Nissens. Kompatibel: Volvo 240/260/740/760/780/940, cross-ref 1346015/1378592/5001906/8601007/8601126/8601127. Nomor part dari riset web terbuka: https://www.ipdusa.com/products/7261/Radiator-Volvo-240-260-740-760-780-940-1991-Nissens-5003505-8603894'),
  ('e0000000-0d0c-0000-0000-000000000004', 'e0000000-0000-0000-0000-00000000e001', '0 986 424 016', 'Kampas Rem Depan Bosch', 'Sistem pengereman', 'set', 4, 420000, 590000, 'Bosch. Kompatibel: Volvo 740/760/940/940 II/960/960 II/S90 I/V90 I (1983-1998). Nomor part dari riset web terbuka: https://www.ebay.com/itm/325727023250'),
  ('e0000000-0d0c-0000-0000-000000000005', 'e0000000-0000-0000-0000-00000000e001', '1205825', 'Bushing Arm Suspensi Depan', 'Suspensi/karet', 'pcs', 6, 75000, 115000, 'Meyle. Kompatibel: Volvo 240/242/244/245/262/264/265. Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-control-arm-bushing-242-244-245-240-262-264-265-front'),
  ('e0000000-0d0c-0000-0000-000000000006', 'e0000000-0000-0000-0000-00000000e001', '31372212', 'Filter Oli Mahle', 'Filter', 'pcs', 10, 65000, 95000, 'Mahle. Kompatibel: Volvo (general model not specified). Nomor part dari riset web terbuka: https://www.blauparts.com/volvo-oil-filter-mahle-31372212.html'),
  ('e0000000-0d0c-0000-0000-000000000007', 'e0000000-0000-0000-0000-00000000e001', 'LX443', 'Filter Udara Mahle', 'Filter', 'pcs', 5, 110000, 160000, 'Mahle. Kompatibel: Volvo 740/940 non-turbo. Nomor part dari riset web terbuka: https://www.ipdusa.com/products/6267/112442-volvo-engine-air-filter-740-940-non-turbo-mahle-lx443-1336397'),
  ('e0000000-0d0c-0000-0000-000000000008', 'e0000000-0000-0000-0000-00000000e001', '43315', 'Bilah Wiper Bosch 20 inch', 'Wiper', 'pcs', 6, 80000, 125000, 'Bosch. Kompatibel: Volvo 740/745/940/760. Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-windshield-wiper-blade-refill-740-745-940-760-43315'),
  ('e0000000-0d0c-0000-0000-000000000009', 'e0000000-0000-0000-0000-00000000e001', '973487', 'Sabuk Multi-Rib Continental', 'Sabuk penggerak mesin', 'pcs', 3, 180000, 260000, 'Continental. Kompatibel: Volvo 740/760/780/940. Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-accessory-drive-belt-740-760-780-940-conti-119x1013'),
  ('e0000000-0d0c-0000-0000-000000000010', 'e0000000-0000-0000-0000-00000000e001', '8602017', 'Master Rem ATE', 'Sistem pengereman', 'unit', 1, 1100000, 1500000, 'ATE. Kompatibel: Volvo 740/760/780/940. Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-brake-master-cylinder-with-abs-740-760-780-940'),
  ('e0000000-0d0c-0000-0000-000000000011', 'e0000000-0000-0000-0000-00000000e001', '14775', 'Tutup Tangki Air Radiator Febi', 'Sistem pendingin', 'pcs', 2, 85000, 130000, 'febi bilstein. Kompatibel: Volvo 740/760/850/940/960 (per Amazon listing; cross-ref 1330147/1357390/1357775/30864125). Nomor part dari riset web terbuka: https://www.autohausaz.com/pn/9445462'),
  ('e0000000-0d0c-0000-0000-000000000012', 'e0000000-0000-0000-0000-00000000e001', '1372441', 'Lampu Belakang Kiri Volvo 240 Wagon', 'Kelistrikan/pencahayaan', 'unit', 1, 550000, 760000, 'Aftermarket (merek tidak disebut). Kompatibel: Volvo 240 wagon. Nomor part dari riset web terbuka: https://www.ipdusa.com/products/6784/Left-Tail-lamp-Assembly-240-Wagon-Aftermarket-Volvo-1372441'),
  ('e0000000-0d0c-0000-0000-000000000013', 'e0000000-0000-0000-0000-00000000e001', '6819033', 'Kabel Rem Tangan Volvo 940', 'Sistem pengereman', 'pcs', 1, 250000, 360000, 'Genuine Volvo (OEM). Kompatibel: Volvo 940 SE. Nomor part dari riset web terbuka: https://usparts.volvocars.com/p/Volvo__940-SE/Parking-Brake-Cable-Right/42793969/6819033.html'),
  ('e0000000-0d0c-0000-0000-000000000014', 'e0000000-0000-0000-0000-00000000e001', '3518885', 'Gril Depan Volvo 740/940', 'Bodi/eksterior', 'unit', 1, 1200000, 1650000, 'OEM/generic reproduction. Kompatibel: Volvo 740/940 1989-1995. Nomor part dari riset web terbuka: https://www.ebay.com/itm/265879416472'),
  ('e0000000-0d0c-0000-0000-000000000015', 'e0000000-0000-0000-0000-00000000e001', '9134332', 'Mud Flap Belakang', 'Bodi/eksterior', 'pasang', 2, 150000, 220000, 'Genuine Volvo (OEM). Kompatibel: Volvo 740/760/940 (5-door only)/960 (5-door only). Nomor part dari riset web terbuka: https://classic-volvo.com/catalog/product/view/id/64883/category/2999/'),
  ('e0000000-0d0c-0000-0000-000000000016', 'e0000000-0000-0000-0000-00000000e001', '1372442', 'Stoplamp Volvo 240 Wagon', 'Kelistrikan/pencahayaan', 'unit', 1, 600000, 840000, 'Professional Parts Sweden. Kompatibel: Volvo 240/244/245 wagons. Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-tail-light-assembly-right-240-244-245-wagons'),
  ('e0000000-0d0c-0000-0000-000000000017', 'e0000000-0000-0000-0000-00000000e001', '69593', 'Pompa Bensin Bosch Volvo 240', 'Bahan bakar', 'unit', 1, 650000, 910000, 'Bosch. Kompatibel: Volvo 940/960/240/740 (non-turbo). Nomor part dari riset web terbuka: https://www.ebay.com/itm/364585055203'),
  ('e0000000-0d0c-0000-0000-000000000018', 'e0000000-0000-0000-0000-00000000e001', 'BPR6ES', 'Busi NGK Copper', 'Pengapian', 'pcs', 12, 28000, 45000, 'NGK. Kompatibel: Volvo 240/940/244/245/740/242/760/780/745, 1988+ B200/B230 engines. Nomor part dari riset web terbuka: https://vp-autoparts.com/en/artiklar/spark-plug-kit-240-740-940-88-.html'),
  ('e0000000-0d0c-0000-0000-000000000019', 'e0000000-0000-0000-0000-00000000e001', '6714088', 'Kabel Busi Denso', 'Pengapian', 'set', 2, 220000, 310000, 'Denso. Kompatibel: Volvo 740/940. Nomor part dari riset web terbuka: https://www.ipdusa.com/products/8434/Spark-Plug-Wire-Set-740-940-for-Volvo-Denso-6714088-271483-110548'),
  ('e0000000-0d0c-0000-0000-000000000020', 'e0000000-0000-0000-0000-00000000e001', 'MA-3715368290', 'Water Pump Mizumo', 'Sistem pendingin', 'unit', 2, 480000, 680000, 'Mizumo Auto. Kompatibel: Volvo 940/740/240/244/245/760/780/745 (1985). Nomor part dari riset web terbuka: https://mizumoauto.com/products/mizumo-auto-ma-3715368290-water-pump-fits-volvo-940-740-240-244-245-760-780-745-1985'),
  ('e0000000-0d0c-0000-0000-000000000021', 'e0000000-0000-0000-0000-00000000e001', '408971D', 'Termostat Wahler', 'Sistem pendingin', 'pcs', 3, 130000, 195000, 'Wahler. Kompatibel: Volvo 240/740/760/780/940. Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-engine-coolant-thermostat-240-740-760-780-940-71'),
  ('e0000000-0d0c-0000-0000-000000000022', 'e0000000-0000-0000-0000-00000000e001', '19-019888', 'Shock Absorber Belakang Bilstein', 'Suspensi/karet', 'pcs', 2, 850000, 1180000, 'Bilstein. Kompatibel: Volvo 740/760/780/940/960. Nomor part dari riset web terbuka: https://www.shockwarehouse.com/products/bilstein-19-019888-rear-b4-oe-replacement-bilstein-touring-class-shock-absorber-volvo-740-760-780-940-960'),
  ('e0000000-0d0c-0000-0000-000000000023', 'e0000000-0000-0000-0000-00000000e001', '4095811', 'Per Keong Depan Lesjofors', 'Suspensi/karet', 'pcs', 2, 420000, 590000, 'Lesjofors. Kompatibel: Volvo 740/745/760/940. Nomor part dari riset web terbuka: https://www.ebay.com/itm/274201358895'),
  ('e0000000-0d0c-0000-0000-000000000024', 'e0000000-0000-0000-0000-00000000e001', '3000449001', 'Kopling Kit Sachs', 'Transmisi', 'set', 1, 1900000, 2650000, 'Sachs. Kompatibel: Volvo 740/940. Nomor part dari riset web terbuka: https://www.amcarparts.co.uk/sachs/235679-sachs-clutch-kit-3000449001-for-volvo-740-940-4013872098491'),
  ('e0000000-0d0c-0000-0000-000000000025', 'e0000000-0000-0000-0000-00000000e001', 'WKH733', 'Bearing Roda Belakang SKF', 'Suspensi/karet', 'set', 3, 310000, 440000, 'SKF. Kompatibel: Volvo 740/760/780/940/960. Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-wheel-bearing-kit-rear-740-760-780-940-960-271262'),
  ('e0000000-0d0c-0000-0000-000000000026', 'e0000000-0000-0000-0000-00000000e001', '022584008', 'Gasket Kepala Silinder Victor Reinz', 'Mesin', 'set', 2, 650000, 910000, 'Victor Reinz. Kompatibel: Volvo 270689 (B230 engine). Nomor part dari riset web terbuka: https://www.ipdusa.com/products/23843/B230-Head-Gasket-Set-Complete-Victor-Reinz-022584008-Volvo-270689'),
  ('e0000000-0d0c-0000-0000-000000000027', 'e0000000-0000-0000-0000-00000000e001', '538599KT1', 'Engine Mount Corteco', 'Mesin', 'pcs', 2, 360000, 510000, 'Corteco. Kompatibel: Volvo (model not detailed in listing). Nomor part dari riset web terbuka: https://www.fcpeuro.com/products/volvo-engine-mount-kit-corteco-538599kt1'),
  ('e0000000-0d0c-0000-0000-000000000028', 'e0000000-0000-0000-0000-00000000e001', '18349', 'Knalpot Walker', 'Knalpot', 'unit', 1, 1100000, 1550000, 'Walker. Kompatibel: Volvo 940. Nomor part dari riset web terbuka: https://www.amazon.com/Walker-18349-SoundFX-Muffler/dp/B000C9475S'),
  ('e0000000-0d0c-0000-0000-000000000029', 'e0000000-0000-0000-0000-00000000e001', '3514629', 'Selang Radiator Atas Volvo', 'Sistem pendingin', 'pcs', 2, 180000, 260000, 'Genuine Volvo (OEM). Kompatibel: Volvo 740 (1985-1991 turbo). Nomor part dari riset web terbuka: https://www.ebay.com/itm/124438682805'),
  ('e0000000-0d0c-0000-0000-000000000030', 'e0000000-0000-0000-0000-00000000e001', '9447755', 'Kaca Spion Kiri OEM', 'Bodi/eksterior', 'pcs', 2, 320000, 450000, 'Genuine Volvo (OEM). Kompatibel: Volvo 240/740/760/940/960/S90/V90. Nomor part dari riset web terbuka: https://www.ipdusa.com/products/14307/835/1992-Volvo-240-DOOR-MIRROR-GLASS-LEFT-Genuine-Volvo-9447755');

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
  ('e0000000-0d0c-0000-0000-000000000012', 'tail lamp kiri',      'eval'),
  ('e0000000-0d0c-0000-0000-000000000012', 'stop kiri',           'eval'),
  ('e0000000-0d0c-0000-0000-000000000014', 'grill',               'eval'),
  ('e0000000-0d0c-0000-0000-000000000015', 'pelindung lumpur',    'eval'),
  ('e0000000-0d0c-0000-0000-000000000001', 'cambelt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000001', 'cam belt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000002', 'fan belt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000002', 'tali kipas', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000002', 'fanbelt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000008', 'wiper blade', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000009', 'drive belt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000009', 'serpentine belt', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000014', 'grille', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000015', 'kepet', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000015', 'kepet spakbor', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000015', 'mudflap', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000016', 'stop lamp', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000016', 'lampu rem', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000018', 'spark plug', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000020', 'pompa air', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000021', 'thermostat', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000022', 'sokbreker', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000023', 'coil spring', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000025', 'wheel bearing', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000026', 'head gasket', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000028', 'muffler', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000018', 'bougie', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000020', 'waterpump', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000022', 'sokbreaker', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000022', 'shockbreaker', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000022', 'shock breaker', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000023', 'pegas ulir', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000024', 'plat kopling', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000024', 'matahari kopling', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000025', 'laher roda', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000026', 'paking', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000026', 'gasket silinder head', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000027', 'engine mounting', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000027', 'dudukan mesin', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000028', 'silencer', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000030', 'spion', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000010', 'master rem', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000010', 'master silinder rem', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000010', 'brake master', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000010', 'master cylinder rem', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000011', 'tutup radiator', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000011', 'radiator cap', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000011', 'tutup tangki', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000011', 'tutup tabung radiator', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000013', 'kabel handbrake', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000013', 'kabel rem parkir', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000013', 'parking brake cable', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000013', 'kabel rem tangan', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000017', 'fuel pump', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000017', 'pompa bahan bakar', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000017', 'pompa bensin elektrik', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000017', 'pompa bensin', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000029', 'selang radiator', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000029', 'radiator hose', 'eval'),
  ('e0000000-0d0c-0000-0000-000000000029', 'selang atas', 'eval');

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
    ('e0000000-0d0c-0000-0000-000000000017'::uuid,  1,  1, 0, 0, 0, 1, 0, 0),
    ('e0000000-0d0c-0000-0000-000000000018'::uuid, 30, 80, 14, 18, 16, 20, 19, 10),
    ('e0000000-0d0c-0000-0000-000000000019'::uuid,  3,  5, 1, 2, 1, 1, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000020'::uuid,  4,  6, 1, 2, 1, 2, 1, 1),
    ('e0000000-0d0c-0000-0000-000000000021'::uuid,  5,  9, 2, 1, 3, 2, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000022'::uuid,  4,  6, 1, 1, 2, 1, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000023'::uuid,  3,  4, 1, 0, 1, 1, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000024'::uuid,  2,  2, 0, 1, 0, 1, 0, 1),
    ('e0000000-0d0c-0000-0000-000000000025'::uuid,  6,  8, 2, 3, 2, 2, 3, 1),
    ('e0000000-0d0c-0000-0000-000000000026'::uuid,  3,  3, 1, 0, 1, 1, 0, 1),
    ('e0000000-0d0c-0000-0000-000000000027'::uuid,  4,  5, 1, 2, 1, 1, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000028'::uuid,  2,  3, 0, 1, 1, 0, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000029'::uuid, 12, 24, 6, 8, 7, 9, 8, 5),
    ('e0000000-0d0c-0000-0000-000000000030'::uuid,  3,  4, 1, 1, 0, 1, 1, 0)
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
       'Saldo awal', date_trunc('month', now()) - interval '6 months'
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
    ('e0000000-0d0c-0000-0000-000000000017'::uuid, 0, 0, 0, 1, 0, 0),
    ('e0000000-0d0c-0000-0000-000000000018'::uuid, 14, 18, 16, 20, 19, 10),
    ('e0000000-0d0c-0000-0000-000000000019'::uuid, 1, 2, 1, 1, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000020'::uuid, 1, 2, 1, 2, 1, 1),
    ('e0000000-0d0c-0000-0000-000000000021'::uuid, 2, 1, 3, 2, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000022'::uuid, 1, 1, 2, 1, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000023'::uuid, 1, 0, 1, 1, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000024'::uuid, 0, 1, 0, 1, 0, 1),
    ('e0000000-0d0c-0000-0000-000000000025'::uuid, 2, 3, 2, 2, 3, 1),
    ('e0000000-0d0c-0000-0000-000000000026'::uuid, 1, 0, 1, 1, 0, 1),
    ('e0000000-0d0c-0000-0000-000000000027'::uuid, 1, 2, 1, 1, 2, 1),
    ('e0000000-0d0c-0000-0000-000000000028'::uuid, 0, 1, 1, 0, 1, 0),
    ('e0000000-0d0c-0000-0000-000000000029'::uuid, 6, 8, 7, 9, 8, 5),
    ('e0000000-0d0c-0000-0000-000000000030'::uuid, 1, 1, 0, 1, 1, 0)
),
monthly as (
  select product_id, m.months_ago, m.qty
  from plan,
  lateral (values (5, s0), (4, s1), (3, s2), (2, s3), (1, s4), (0, s5)) as m(months_ago, qty)
)
insert into stock_transactions (business_id, product_id, location_id, transaction_type, quantity, notes, created_at)
select 'e0000000-0000-0000-0000-00000000e001', product_id, 'e0000000-0ca0-0000-0000-000000000001', 'keluar', qty,
       'Riwayat penjualan awal (simulasi)',
       least(date_trunc('month', now()) - make_interval(months => months_ago) + interval '9 days', now() - interval '1 hour')
from monthly
where qty > 0
order by months_ago desc;

commit;

-- Pemeriksaan cepat: harus 30 produk, dan saldo Toko/Gudang sesuai kolom toko/gudang di atas.
select p.part_number, p.name, l.name as lokasi, s.quantity, s.available_quantity
from stock s
join products p on p.id = s.product_id
join locations l on l.id = s.location_id
where s.business_id = 'e0000000-0000-0000-0000-00000000e001'
order by p.part_number, l.name;
