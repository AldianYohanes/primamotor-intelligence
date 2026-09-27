# Fitur POS — Prima Motor Volvo

## Update: hardening keamanan (migration 0026)

Setelah review, ditemukan gap serius di v1 (migration 0025) dan sudah diperbaiki:

1. **Harga produk sekarang TIDAK PERNAH dipercaya dari client.** `record_sale`
   selalu ambil `unit_price` dari `products.selling_price` di dalam RPC itu
   sendiri — bukan cuma divalidasi lalu ditolak kalau beda, tapi memang tidak
   pernah dibaca dari `p_items` sama sekali. Route Handler juga sudah tidak
   menerima `unit_price` di body request checkout.
2. **Nomor nota urut**: `sales.sale_number`, format `INV/2026/000123`, reset
   per tahun per tenant, di-generate atomik di dalam `record_sale` lewat
   `next_sale_number()` (tabel `sale_counters`, tanpa RLS, hanya bisa diakses
   lewat fungsi itu).
3. **Void dibatasi 24 jam** sejak nota dibuat untuk role `admin`; role `owner`
   tetap bisa void kapan saja (butuh koreksi lintas periode tetap mungkin,
   tapi cuma otoritas tertinggi tenant).

**Wajib jalankan `0026_pos_security_hardening.sql` SETELAH `0025_pos_sales.sql`**
kalau kamu sudah sempat deploy 0025 duluan — 0026 pakai `create or replace
function` jadi aman dijalankan di atas 0025, tidak perlu drop apa pun.

## Update 2: alur kasir (migration 0027)

Empat item dari daftar gap "alur kasir" sudah dikerjakan, dengan simplifikasi
yang didokumentasikan di komentar kode:

1. **Hold/park transaction** — tombol "Tahan" di terminal kasir. **Disimpan
   murni di memori komponen** (bukan DB), hilang kalau tab di-refresh — kalau
   ternyata sering dibutuhkan lintas refresh, lihat komentar `HeldCart` di
   `pos-terminal/Component.tsx` untuk titik perluasan (tabel `held_carts`).
2. **Split payment** — kombinasi metode dalam satu nota (tabel `sale_payments`
   baru). **Tidak ada kembalian untuk split** (harus pas/lebih tanpa
   kembalian) — cuma metode 'cash' tunggal yang dapat kembalian. Alasan &
   titik perluasan ada di komentar migration 0027.
3. **Piutang pelanggan** — tabel `customers` (dengan `credit_limit`, default
   0 = tidak boleh piutang sama sekali, harus di-set eksplisit admin/owner)
   + `customer_payments` untuk pelunasan. Modul admin baru `Pelanggan Piutang`
   di `/admin/pos/customers` untuk lihat saldo & catat pelunasan.
4. **Barcode scanner** — search box di terminal kasir auto-tambah ke
   keranjang kalau hasil pencarian pas 1 produk saat Enter ditekan (pola
   keyboard-wedge scanner standar). Belum ditest dengan hardware scanner
   sungguhan — logika keyboard-nya standar tapi tetap perlu dicoba di lapangan.

## Update 3: spesifik domain otomotif (migration 0028)

1. **Kompatibilitas model mobil di titik penjualan** — ternyata tabel
   `product_model_compatibility` + `car_models` **sudah ada** di skema (dari
   modul car-models yang sudah ada), jadi ini tidak perlu tabel baru. Terminal
   kasir (`GET /api/admin/pos/products`) sekarang menyertakan `compatible_models`
   per produk (mis. "Volvo 240 (1975-1993)") dan menampilkannya di kartu
   produk — kasir bisa cek kecocokan sebelum jual tanpa pindah layar.
2. **Klaim garansi per-item** — `products.warranty_days` (nullable, default
   tidak ada garansi dilacak) + tabel `warranty_claims` + RPC
   `claim_warranty_return`. **Sengaja terpisah dari void_sale**: void
   membatalkan SELURUH nota dalam 24 jam (kasus "salah input tadi"), klaim
   garansi menangani SATU item yang balik berhari-hari/berminggu kemudian
   karena cacat — tidak menyentuh pembayaran/total nota, cuma mengembalikan
   stok (untuk resolusi 'replaced'/'refunded'; 'repaired' tidak mengubah
   stok) dan mencatat resolusinya. **Pengembalian uang untuk resolusi
   'refunded' ditangani MANUAL oleh toko di luar sistem** — RPC ini tidak
   menyentuh pembukuan otomatis, cuma dokumentasi klaim + stok.
   - Route baru: `POST /api/admin/pos/sales/[id]/items/[itemId]/warranty-claim`
     — sengaja TIDAK dibatasi admin/owner & tidak butuh PIN (bukan aksi
     finansial yang membalikkan pembayaran).
   - Sale detail sekarang menyertakan `warranty_until` per item (dihitung dari
     `sale.created_at + products.warranty_days`) dan status klaim, ditampilkan
     di dialog detail nota (`pos-sales`) dengan tombol "Klaim" kalau masih
     dalam masa garansi & belum pernah diklaim.
3. **`warranty_days` sudah bisa di-set lewat API produk yang sudah ada**
   (`POST`/`PATCH /api/admin/products`) — field baru, opsional, default tidak
   ada garansi dilacak. **Belum saya tambahkan input field-nya di form UI
   modul `products` yang sudah ada** (di luar scope perubahan POS ini, dan
   supaya tidak menyentuh modul yang sudah stabil tanpa diminta) — untuk
   sekarang, set lewat API langsung atau tambahkan input kecil di
   `modules/products/Component.tsx` kapan-kapan.

**Jalankan `0028_pos_warranty_claims.sql` setelah 0025-0027.**

## Status keseluruhan

Semua item dari daftar gap awal (#1-9) sudah dikerjakan kecuali dua hal
operasional yang belum disentuh: **laporan shift/tutup kasir (X/Z report)**
dan **struk format thermal (ESC/POS)**. Tanya kalau mau lanjut ke salah satunya.

## Update 4: shift kasir & struk thermal (migration 0029)

1. **Shift kasir (X/Z report)** — tabel `shifts` baru. Berbasis rentang waktu
   (`opened_at`..`closed_at`) terhadap `sales`/`sale_payments` yang sudah ada,
   **bukan** lewat kolom `shift_id` baru di `sales` — jadi `record_sale`
   (migration 0025-0027) **tidak diubah sama sekali**, lebih aman daripada
   menyentuh ulang RPC yang sudah teruji. Konsekuensinya didokumentasikan di
   komentar migration: kalau nota di-void di shift yang beda dari shift saat
   nota dibuat, rekonsiliasi kas shift itu bisa sedikit meleset — batasan
   pendekatan berbasis waktu, bukan bug tersembunyi.
   - **Shift SENGAJA TIDAK jadi prasyarat checkout** — POS tetap bisa dipakai
     tanpa shift terbuka sama sekali, ini murni alat rekonsiliasi kas opsional.
     Kalau nanti mau diwajibkan, itu perubahan terpisah yang lebih invasif
     (perlu ubah `record_sale`).
   - Tombol "Buka Shift" / "Shift Aktif" di header terminal kasir → panel
     buka shift (kas awal), lihat laporan real-time (X report, boleh dicek
     kapan saja), dan tutup shift (Z report: input kas fisik dihitung, sistem
     hitung `expected_cash` & `cash_variance` otomatis, dikunci permanen —
     **tidak ada endpoint reopen** kalau salah input, harus dikoreksi manual
     oleh admin/owner langsung di DB).
   - **Belum ada halaman admin terpisah untuk riwayat semua shift lintas
     kasir** — API-nya sudah mendukung (`GET /api/admin/pos/shifts`, admin/owner
     otomatis lihat semua staf), tinggal dibuatkan UI kalau dibutuhkan.
2. **Struk thermal** — `Receipt` di terminal kasir sekarang punya toggle
   58mm/80mm dan `@media print` yang menyembunyikan seluruh halaman kecuali
   struk, ukuran kertas & font disesuaikan (monospace, font kecil, padding
   minimal) supaya hasil cetak pas di printer thermal yang di-setup sebagai
   printer biasa di OS. **Bukan** raw ESC/POS lewat WebUSB/WebSerial — itu
   perlu development terpisah dengan printer fisik untuk ditest, tidak bisa
   divalidasi dari sandbox pengembangan ini.

**Jalankan `0029_pos_shifts.sql` setelah 0025-0028.**

Dengan ini seluruh 9 gap dari review awal + 2 item operasional sudah
dikerjakan. Sisa "belum" yang eksplisit didokumentasikan di atas: halaman
admin riwayat shift lintas kasir, dan ESC/POS asli kalau nanti ada printer
fisik untuk ditest.

## Update 5: riwayat shift admin + field garansi di form produk

Dua hal yang masih bisa saya kerjakan tanpa hardware fisik:

1. **Halaman admin riwayat shift** (`/admin/pos/shifts`) — tabel semua shift
   lintas kasir (admin/owner otomatis lihat semua staf, `GET /api/admin/pos/shifts`
   sudah mendukung ini dari awal), dengan dialog detail yang menampilkan
   breakdown per metode bayar + selisih kas untuk shift yang sudah ditutup,
   atau snapshot X report kalau masih terbuka. Tidak ada migration baru —
   modul ini murni frontend + reuse endpoint yang sudah ada.
2. **`warranty_days` sekarang bisa diisi langsung dari form produk yang
   sudah ada** (`/admin/products`) — field baru "Garansi (hari, opsional)" di
   form create/edit, mengikuti pola input yang sama persis dengan field
   lain di form itu. Sebelumnya cuma bisa diisi lewat API langsung.

**Yang masih benar-benar di luar jangkauan saya**: struk ESC/POS asli via
WebUSB/WebSerial — itu perlu printer thermal fisik untuk ditest, tidak
mungkin divalidasi dari sandbox pengembangan tanpa hardware.


Dibuat mengikuti pola project (§3–§12 project instructions). Semua kode di sini
**belum di-deploy** ke Supabase project asli — saya tidak punya akses jaringan
ke `*.supabase.co` dari sandbox ini, jadi langkah deploy migration SQL tetap
perlu dijalankan manual oleh kamu.

## Cara deploy

1. Copy isi `supabase/migrations/0025_pos_sales.sql` ke Supabase SQL Editor
   project asli (atau `supabase db push` kalau CLI-nya sudah terhubung), lalu jalankan.
2. Verifikasi RPC baru muncul:
   ```sql
   select routine_name from information_schema.routines
   where routine_name in ('record_sale', 'void_sale');
   ```
3. (Opsional tapi disarankan) Gabungkan `supabase/tests/rls_pos.test.sql` ke
   `supabase/tests/rls.test.sql` yang sudah ada, isi `<business_a_id>` dkk
   dengan UUID hasil seed test kamu, lalu jalankan pgTAP seperti biasa.
4. Copy seluruh folder `src/` ke project asli (timpa/gabung — semua file baru,
   tidak ada file lama yang diedit selain `src/lib/db/types.ts` dan
   `src/components/admin/AdminShell.tsx`, keduanya cuma ditambahi, bukan diganti total).
5. `npx tsc --noEmit` dan `npx next build` di project asli sebelum commit,
   sesuai kebiasaan kerja kamu (§13) — saya tidak bisa jalankan build penuh di
   sini karena upload cuma berisi `src/`+`lib/`, tanpa `package.json`/`node_modules`.

## Yang dibuat

**Database** (`supabase/migrations/0025_pos_sales.sql`)
- Tabel `sales` (header nota) + `sale_items` (baris produk), RLS standar §10.
- RPC `record_sale` — checkout atomik multi-item: lock stok `FOR UPDATE`
  terurut per `product_id` (anti-deadlock), validasi stok & pembayaran cash
  SEBELUM menulis apa pun, lalu insert `sales`+`sale_items`+`stock_transactions`
  ('keluar') per baris. Idempotent lewat `idempotency_key`.
- RPC `void_sale` — kembalikan stok lewat baris `stock_transactions` baru
  ('retur', append-only, TIDAK mengedit baris lama), tandai nota `voided`.

**Route Handlers** (`src/app/api/admin/pos/**`)
- `GET /products` — pencarian cepat produk + stok per lokasi utk terminal kasir.
- `GET/POST /sales` — riwayat (paginated, sortable) + checkout.
- `GET /sales/[id]` — detail nota + item.
- `POST /sales/[id]/void` — **dibatasi role admin/owner** + wajib PIN
  re-konfirmasi (`reconfirmPin`, pola sama seperti update/transfer stok).

**Frontend**
- `modules/pos-terminal/` — layar kasir penuh: cari produk, keranjang, diskon
  nota, 4 metode bayar (cash/transfer/QRIS/kartu), hitung kembalian otomatis,
  struk siap cetak (`window.print()`), idempotency key per sesi checkout.
- `modules/pos-sales/` — riwayat penjualan (tabel server-side sort/filter),
  dialog detail nota, dan form void (alasan + PIN) yang cuma muncul kalau
  `canVoid` true (role dicek server-side juga, ini murni UX).
- `app/(pos)/pos/page.tsx` — halaman kasir full-screen (di luar AdminShell,
  pola sama seperti `(chat)/chat/page.tsx`), plus `loading.tsx`.
- `app/(admin)/admin/pos/sales/page.tsx` — riwayat penjualan di dalam AdminShell.
- `AdminShell.tsx` — ditambah nav "Riwayat Penjualan" + tombol cepat "Buka Kasir".

## Keputusan desain yang saya ambil (bukan hasil tanya-jawab eksplisit)

Beberapa hal saya putuskan sendiri karena scope-nya kecil/reversible, boleh
diralat kalau tidak sesuai:

- **Checkout boleh dilakukan role `staff` biasa** (bukan cuma admin/owner) —
  kasir harian memang perlu akses ini. **Void dibatasi admin/owner** karena
  membalikkan uang & stok.
- **Diskon**: cuma diskon per-nota (tidak ada diskon per-item) untuk v1, biar
  UI kasir tetap simpel. Gampang ditambah kalau ternyata dibutuhkan.
- **Pajak**: kolom `tax_amount` sudah ada di skema/RPC tapi tidak ada input-nya
  di UI kasir (toko spare part informal biasanya tidak PPN) — tinggal tambah
  field kalau perlu, backend sudah siap.
- **Struk**: cetak lewat `window.print()` browser biasa, bukan integrasi
  printer thermal khusus (ESC/POS dsb) — itu di luar scope "fully functional
  CRUD" yang diminta, dan butuh driver/hardware spesifik yang saya tidak tahu
  dipakai toko ini atau tidak.
- **Lokasi default**: dropdown otomatis pilih lokasi bertipe `toko` pertama
  saat terminal dibuka, staf tetap bisa ganti manual (relevan kalau nanti ada
  multi-cabang).

## Belum tersentuh / cocok jadi PR/task terpisah

- Laporan penjualan harian/bulanan khusus POS (beda dari `get-sales-trend`
  yang sudah ada untuk chat agent) — belum diminta, gampang ditambah di atas
  `sales`/`sale_items` yang sudah ada.
- Cetak struk format thermal (kalau toko pakai printer kasir fisik).
- Diskon per-item (saat ini kolom `discount_amount` di `sale_items` sudah ada
  di skema untuk future-proofing, tapi RPC checkout saat ini selalu mengirim 0
  dari sisi frontend).

## Update 6: hasil audit menyeluruh (migration 0030)

Diminta evaluasi keseluruhan & cari celah — ini bukan sekadar review dari
ingatan, saya baca ulang tiap file baris demi baris. Ditemukan 5 celah nyata,
2 di antaranya cukup berarti:

1. **🔴 Scan barcode sebenarnya tidak jalan andal.** `handleSearchKeyDown`
   sebelumnya mengecek hasil SWR yang sudah di-debounce 300ms saat Enter
   ditekan — scanner barcode ngetik+Enter jauh lebih cepat dari itu, jadi
   yang dicek adalah hasil pencarian LAMA, bukan hasil scan. **Diperbaiki**:
   Enter sekarang memanggil pencarian langsung (bypass debounce & hook),
   baru tambah ke keranjang kalau hasilnya persis 1.
2. **🟠 Race condition tutup shift.** `POST .../close` sebelumnya SELECT lalu
   UPDATE terpisah tanpa lock — dua klik/retry hampir bersamaan bisa
   menimpa angka Z report tanpa error. **Diperbaiki**: UPDATE sekarang
   pakai guard `.eq("status", "open")`, kalau sudah keburu ditutup request
   lain, dapat error 409 yang jelas alih-alih diam-diam menimpa.
3. **🟠 Widget shift di terminal bisa salah orang untuk admin/owner.**
   `GET /api/admin/pos/shifts` sengaja kembalikan SEMUA shift tenant untuk
   role admin/owner (buat halaman riwayat), tapi widget "shift saya" di
   terminal ikut kena efek itu — admin/owner yang pegang kasir sendiri bisa
   nampilin/nutup shift kasir lain di lokasi yang sama. **Diperbaiki**:
   endpoint sekarang terima `?mine=true` yang paksa filter ke staf pemanggil
   terlepas dari role; widget terminal selalu pakai parameter ini.
4. **🟡 `customer_id` tidak divalidasi kepemilikan tenant di luar piutang.**
   Baik Route Handler maupun RPC `record_sale` cuma cek `customer_id` milik
   tenant yang benar kalau `payment_method='piutang'` — metode lain lolos
   tanpa validasi (frontend tidak pernah kirim begini, tapi API menerimanya
   mentah-mentah). **Diperbaiki di kedua lapis**: Route Handler & RPC
   sekarang validasi kepemilikan tenant untuk `customer_id` apa pun metode
   pembayarannya.
5. **🟢 Pesan error keliru.** Kelebihan bayar metode tunggal non-cash dapat
   pesan "split payment", padahal itu bukan split. **Diperbaiki**: error
   baru `overpayment_not_allowed_for_non_cash` dipisah dari
   `overpayment_not_allowed_for_split`.

**Jalankan `0030_pos_audit_fixes.sql` setelah 0025-0029** (cuma me-replace
`record_sale`, tidak ada perubahan skema tabel).

### Yang SUDAH saya cek dan TERNYATA aman (supaya tidak dikira belum diperiksa)

- `void_sale` tidak kena race condition serupa poin #2 — dia RPC dengan
  `FOR UPDATE` yang benar sejak awal, jadi Postgres sendiri yang menyerialkan
  panggilan bersamaan.
- Idempotency key saat hold/resume transaksi di terminal — sudah ditelusuri
  urutan `setState`-nya, tidak ada race antara cart aktif & cart yang ditahan.
- RLS di semua tabel baru (`sales`, `sale_items`, `customers`, `sale_payments`,
  `customer_payments`, `warranty_claims`, `shifts`) — pola baca/tulis
  konsisten dengan §10, mutasi sesungguhnya selalu lewat admin client setelah
  `requireStaff()`, RLS jadi lapisan kedua bukan satu-satunya penjaga.

### Catatan struk & laporan penjualan (dari daftar "belum tersentuh" di atas)

Dua poin di daftar "belum tersentuh" sebelumnya SUDAH dikerjakan di Update 4
(struk thermal 58mm/80mm via CSS print, bukan ESC/POS asli) — daftar di atas
tidak diperbarui saat itu, dicatat di sini supaya tidak membingungkan.
