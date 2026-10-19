# Audit UX POS (Kasir)

Dibuat dari pembacaan kode `src/modules/pos-terminal/Component.tsx` dan `src/app/(pos)/pos/page.tsx`. **Belum dicoba langsung di browser** (login butuh PIN pemilik), jadi dampak di HP/laptop adalah perkiraan dari layout dan class Tailwind. Mohon dicek manual sebelum uji 2 Nov.

Alur yang diaudit: buka shift → cari barang → keranjang → bayar → struk → tutup shift.

## Sudah dikerjakan

| # | Masalah | Dampak | Perbaikan | Status |
|---|---------|--------|-----------|--------|
| 1 | Hasil cari tidak bisa dipilih pakai keyboard. Enter hanya menambah kalau hasilnya persis 1. | Kalau hasil lebih dari 1 (mis. "oli"), kasir harus pegang mouse. Lambat saat ramai. | Panah atas/bawah menyorot hasil, Enter menambah yang disorot. Daftar ikut menggulung ke baris yang disorot. | Dikerjakan |
| 2 | Pintasan tidak kelihatan; hanya F9 yang tertulis kecil di bawah. | Kasir baru tidak tahu ada Esc, Enter, F9. | Baris petunjuk tombol di bawah kolom cari (hanya di laptop). Tambah `F2` atau `/` untuk lompat ke kolom cari. | Dikerjakan |
| 3 | Tombol Bayar ada di dasar panel kanan, setelah nama, diskon, metode, dst. Di laptop layar kecil perlu scroll; di HP ada di bawah satu layar penuh katalog. | Kasir sering mencari-cari tombol bayar. | Laptop: panel keranjang menempel setinggi layar, ringkasan dan tombol Bayar selalu di bawah, bagian form bisa digulung sendiri. HP: bar bawah dengan total dan tombol Bayar (loncat ke panel bayar), hilang kalau tombol aslinya sudah kelihatan. | Dikerjakan |
| 4 | Total tertulis kecil di tengah form. | Nominal yang paling penting kurang menonjol. | Total dibesarkan (text-2xl) di bagian bawah, tombol Bayar lebih besar. | Dikerjakan |
| 5 | Barang masuk keranjang tanpa tanda. Kalau sudah mentok stok, klik diam-diam tidak terjadi apa-apa. | Kasir tidak tahu klik tadi berhasil atau tidak. | Pesan singkat di bawah kolom cari ("X masuk keranjang (×2)" atau "sudah maksimal / stok habis"). | Dikerjakan |
| 6 | Tombol +/−/hapus di keranjang kecil (±26 px). Katalog stretch tinggi baris. | Salah sentuh di HP. | Tombol 36 px di HP, 32 px di laptop. Angka jumlah langsung terpilih saat diklik, Enter kembali ke kolom cari. Subtotal per baris ditampilkan. Nama barang bisa 2 baris. Keranjang otomatis menggulung ke barang terbaru. | Dikerjakan |
| 7 | Halaman bisa lebih dari satu layar di HP karena panel kiri `min-h-dvh`. | Keranjang jauh di bawah. | Tinggi paksa hanya di laptop. | Dikerjakan |
| 8 | Setelah bayar, tombol "Transaksi Baru" harus diklik. | Antrean ramai, harus pegang mouse lagi. | Enter = Transaksi Baru (diabaikan 0,6 detik pertama dan saat fokus di tombol, supaya tidak tertekan tidak sengaja). Tombol lebih besar dan otomatis terfokus. | Dikerjakan |
| 9 | Galat bayar tampil di tengah panel, bisa di luar layar. | Kasir tidak sadar bayar gagal. | Galat sekarang di footer dekat tombol Bayar, dengan `role="alert"`. | Dikerjakan |

## Usulan (belum dikerjakan)

| # | Masalah | Dampak | Usulan | Status |
|---|---------|--------|--------|--------|
| A | Ganti lokasi saat keranjang terisi tidak memperingatkan. Stok di keranjang berasal dari lokasi lama. | Bisa checkout barang dengan batas stok salah (server tetap validasi, tapi kasir kaget). | Konfirmasi atau kosongkan keranjang saat ganti lokasi. | Usulan |
| B | Transaksi yang ditahan hilang kalau halaman di-refresh (memang disengaja, lihat komentar di kode). | Kasir yang tidak sengaja refresh kehilangan antrean. | Simpan di `sessionStorage` dulu (tanpa database). | Usulan |
| C | Checkout tidak mengecek shift terbuka di layar kasir; tombol "Buka Shift" hanya tampil kecil di atas. | Penjualan bisa tercatat tanpa shift, laporan Z kurang lengkap. | Banner "Shift belum dibuka" di atas keranjang. Perlu dikonfirmasi dulu aturan bisnisnya (apakah shift wajib) sebelum mengubah tombol Bayar. | Usulan |
| D | Perhitungan kembalian, diskon, dan "uang pas" memakai `<input type=number>` biasa. Di HP muncul keyboard angka, tapi tidak ada pemisah ribuan. | Salah ketik nol sulit terlihat. | Komponen input rupiah dengan pemisah ribuan. | Usulan |
| E | Pintasan tidak aktif di HP/tablet tanpa keyboard fisik, dan tidak ada pintasan untuk Tahan transaksi. | Pintasan hanya membantu pengguna laptop. | Tambah pintasan F4 untuk Tahan setelah kasir mencoba pintasan yang ada. | Usulan |
| F | Tidak ada test komponen (environment test = node). Perubahan interaksi hanya dites lewat fungsi murni. | Regresi di tampilan tidak tertangkap otomatis. | Tambah jsdom + testing-library bila skripsi memberi waktu. | Usulan |
| G | `Component.tsx` 1200 baris (kasir, shift, struk, pelanggan dalam satu file). | Susah dirawat. | Pecah per bagian, tanpa ubah perilaku. | Usulan |
| H | Lint `react-hooks/set-state-in-effect` sudah ada sebelumnya di dua tempat (reset lokasi awal, muat laporan shift). | Hanya peringatan gaya, tidak mengubah perilaku. | Rapikan bersama pecahan komponen. | Usulan |

## Yang belum diverifikasi di browser

- Tinggi panel kanan memakai `100dvh - 52px` (perkiraan tinggi AppHeader). Kalau header lebih tinggi karena judul dua baris, bagian bawah footer bisa terpotong sedikit di laptop.
- Bar Bayar mengambang di HP (muncul/hilang lewat IntersectionObserver) dan efek menggulung ke barang terbaru.
- Tidak ada perubahan pada perhitungan harga, stok, shift, pembayaran, atau API.
