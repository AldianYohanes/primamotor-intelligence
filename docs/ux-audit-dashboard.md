# Audit UX Dashboard Admin

Halaman: `/admin` (`src/app/(admin)/admin/page.tsx`, modul `src/modules/dashboard-summary/`).
Dicek lewat baca kode, test, dan typecheck. Belum dicek di browser (login butuh PIN pemilik).

## Sumber data grafik dan daftar baru

Semua angka penjualan di dashboard diambil dari tabel POS **`sales`** (status `completed`, nota batal tidak ikut) dan **`sale_items`** untuk barang terlaris.

Kenapa bukan `stock_transactions` keluar: grafik tren harian yang sudah ada memakai `sales`, jadi grafik bulanan dengan sumber yang sama menghasilkan angka yang cocok (jumlah 30 hari harian = angka bulanan). Stok keluar juga mencakup koreksi stok opname dan transfer, bukan cuma penjualan, jadi bisa menyesatkan sebagai "penjualan".

Stok menipis memakai definisi yang sama dengan halaman Stok per Lokasi: total stok tersedia semua lokasi `<=` `min_threshold`. Produk tanpa `min_threshold` tidak dihitung.

Semua query diberi filter `business_id` tenant aktif dan lewat `requireStaffRow("portal.access")`.

## Temuan

| # | Masalah | Dampak | Perbaikan | Status |
|---|---------|--------|-----------|--------|
| 1 | Halaman depan hanya punya tren 7/30 hari. Tidak ada gambaran bulanan, barang terlaris, atau stok menipis. | Pemilik harus buka beberapa halaman untuk jawaban dasar ("bulan ini lebih bagus dari bulan lalu?", "apa yang harus dibeli?"). | Grafik batang penjualan 6 bulan (recharts, sudah ada di package.json), daftar 5 barang terlaris 30 hari, daftar 8 stok menipis yang tiap barisnya menuju `/admin/stock`. Endpoint baru `GET /api/admin/dashboard/overview` + test. | Dikerjakan |
| 2 | Kalau API ringkasan gagal, tiga kartu angka (pendapatan, transaksi, shift) tetap berupa kotak loading selamanya. | Terlihat seperti masih memuat, padahal gagal. | Saat error kartu menampilkan "-", pesan error ada di kartu tren. | Dikerjakan |
| 3 | Hari dihitung memakai UTC / zona server. Nota sebelum jam 07.00 WIB masuk ke hari sebelumnya, dan di laptop berzona WIB deretan hari bisa geser satu hari (test route ini gagal di mesin WIB sebelum diperbaiki). | "Pendapatan Hari Ini" bisa salah di pagi hari; tren geser. | Pengelompokan hari dan bulan memakai WIB (UTC+7) lewat satu konstanta bersama. | Dikerjakan |
| 4 | Grafik tren tidak menjelaskan angkanya dari mana. | Pemilik tidak tahu nota batal ikut atau tidak. | Keterangan di bawah judul grafik: "dari nota POS yang selesai (tidak termasuk nota batal)". | Dikerjakan |
| 5 | Tombol rentang 7/30 hari tidak memberi tahu pembaca layar mana yang aktif, tombolnya kecil (tinggi ~26px) untuk HP. | Susah ditekan di HP, tidak jelas bagi pembaca layar. | `type="button"`, `aria-pressed`, `role="group"`, padding vertikal lebih besar. | Dikerjakan |
| 6 | Grafik hanya gambar tanpa teks pengganti. | Pembaca layar tidak dapat apa-apa. | `role="img"` + `aria-label` ringkasan; grafik bulanan juga punya tabel tersembunyi (`sr-only`). | Dikerjakan |
| 7 | Nama produk di Saran Restock kosong kalau relasi produk tidak ada. | Baris tampil tanpa judul. | Teks cadangan "Produk tidak dikenal". | Dikerjakan |
| 8 | Setiap bagian punya state sendiri: loading (skeleton), kosong (kalimat penjelasan), error (pesan merah + tombol "Coba lagi" untuk ringkasan baru). | Sebelumnya keadaan kosong/error tidak seragam. | Dibuat untuk bagian baru; pesan error memakai `role="alert"`. | Dikerjakan |
| 9 | Kartu "Notifikasi" di atas dan daftar "Notifikasi" di bawah menampilkan angka yang sama. Kartu tidak bisa diklik. | Ruang layar terbuang di HP; informasi ganda. | Gabung kartu ke judul bagian, atau jadikan tautan anchor. | Usulan |
| 10 | Notifikasi tidak punya tanda sudah/belum dibaca atau waktu. | Pemilik tidak tahu mana yang baru. | Perlu kolom status baca dan tampilkan `created_at`. Kolom baru berarti migrasi database. | Usulan (butuh migrasi) |
| 11 | Saran Restock di dashboard tidak punya tombol tindak lanjut (setujui/tolak), hanya tautan ke audit log. | Pemilik harus cari sendiri tempat menindaklanjuti. | Tautkan ke halaman saran belanja ulang begitu sesi lain selesai membuatnya. | Usulan (tergantung sesi lain) |
| 12 | Baris Stok Menipis menuju `/admin/stock` tanpa memfilter barang yang diklik. | Setelah klik, pemilik masih harus mencari barangnya. | Halaman stok perlu menerima parameter pencarian (`?q=`), bukan wilayah dashboard. Sementara tautan ke daftar stok. | Usulan |
| 13 | Data diagregasi di server dengan mengambil semua nota 6 bulan. | Aman untuk skala saat ini (ratusan nota/bulan), melambat kalau jadi puluhan ribu. | Pindah ke fungsi agregasi di database (RPC). Butuh migrasi, jadi usulan. | Usulan |
| 14 | Halaman Laporan (`/admin/reports`) hanya punya tren satu produk dan tidak ditautkan dari dashboard. | Fitur laporan sulit ditemukan. | Tambah tautan "Lihat laporan per produk" dari kartu terlaris. | Usulan |
| 15 | Belum diverifikasi di browser: tampilan HP (375px), kontras warna, urutan tab keyboard. | Mungkin ada kolom yang terlalu sempit. | Cek manual setelah login. | Perlu dicek |
