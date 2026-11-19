# Lembar Tugas UAT Stokgent (pegangan pendamping)

> Lembar ini disimpan seperti yang dipakai saat UAT. Form final memakai pilihan Berhasil / Kurang sesuai ekspektasi / Gagal atau terdapat error (bukan "Selesai tapi dibantu") dan nggak memuat pertanyaan izin foto. Lihat [google-form.md](google-form.md) dan hasilnya di [rekap-sus.md](rekap-sus.md).

UAT 19 November 2026, 2 responden (pemilik dan 1 staf), maksimal 20 menit per orang.
Perangkat: perangkat pendamping, model Saga (Qwen2.5-3B), tenant `eval-prima-motor`, internet dari hotspot HP.

> PIN akun uji **jangan ditulis di file ini** (repo). Tulis tangan di lembar cetak atau simpan di catatan HP.
> PIN akun tambahan berasal dari `SEED_STAFF_PIN` di `.env.local`.

## A. Checklist sebelum berangkat

- [ ] Di `/eval`, klik **"Reset data eval"**. Akun `kasir1`, `kasir2`, `gudang1`, data POS, pelanggan, dan pemasok jadi terisi.
- [ ] Pastikan akun `owner` bisa login (toko `eval-prima-motor`, username `owner`). Kalau belum ada, ikuti langkah a-c di `supabase/seed_eval.sql`.
- [ ] Login sebagai `owner`, buka `/chat`, pilih model **Saga (Qwen2.5-3B)**, tunggu sampai model siap. Unduhan model cukup sekali karena tersimpan di cache browser.
- [ ] Masih dalam keadaan online, tanya stok sekali di `/chat` supaya data stok offline tersimpan di perangkat. Header chat harus menunjukkan waktu sinkron terakhir.
- [ ] **Dry run**: kerjakan semua tugas di bawah sekali dengan akun masing-masing. Catat angka stok yang muncul. Angka di bagian kunci diambil dari `seed_eval.sql` dan bisa bergeser setelah "Reset data eval" atau setelah dry run.
- [ ] Cek apakah `gudang1` bisa dipakai untuk tugas chat **dan** POS. Semua akun tambahan ber-role `staff`, dan checkout POS memang nggak dibatasi ke admin. Kalau ternyata harus ganti akun, kamu yang login ulang di antara tugas.
- [ ] Login `gudang1` di `/pos` dan **buka shift lebih dulu**, supaya tugas POS staf nggak makan waktu buka shift.
- [ ] Sesudah dry run, klik "Reset data eval" lagi supaya stok kembali ke awal. Ulangi langkah sinkron stok offline.
- [ ] Jalankan `buat-form.gs` (cara di `google-form.md`), kirim satu jawaban uji, cocokkan skor di tab Rekap dengan tabel cek di `rekap-sus.md`, lalu hapus jawaban uji itu.
- [ ] Siapkan QR link form (dari menu Kirim → ikon link, lalu buat QR-nya). Cetak lembar ini atau buka di HP lain.
- [ ] Cas penuh perangkat dan HP hotspot. Bawa charger.

## B. Alur sesi per responden (±20 menit)

| Menit | Kegiatan |
|---|---|
| 0-2 | Sapa. Bacakan isi Bagian 1 form (tujuan, data tiruan, boleh berhenti). Minta izin foto. |
| 2-3 | Responden scan QR, isi **Bagian 1 (persetujuan) dan Bagian 2 (identitas)**, tekan "Berikutnya", lalu **biarkan tab form tetap terbuka**. |
| 3-14 | Responden mengerjakan 5 tugas di perangkatmu. Kamu bacakan kalimat tugas apa adanya. Nggak ada demo dulu. |
| 14-20 | Responden lanjut mengisi form di HP-nya: hasil tiap tugas, SUS, soal chat, komentar. Lalu kirim. |

Aturan selama tugas:
- **Selesai** = responden sendiri yang merasa tugasnya sudah selesai. Kamu nggak menilai benar/salahnya jawaban model.
- Bantu hanya kalau responden benar-benar mentok, lalu coret kolom "dibantu". Bilang ke responden supaya nanti memilih "Selesai tapi dibantu" di form.
- Batas **5 menit per tugas**. Lewat 5 menit, tugas dihentikan dan dicatat "Tidak selesai (model lambat)".
- Kalau model error atau GPU putus: muat ulang halaman, ulangi tugas **sekali**, lalu coret kolom "model error". Kalau gagal lagi, tugas tidak selesai.
- PIN konfirmasi **diketik responden**. Kasih tahu PIN-nya sebelum tugas 2.
- Bug yang ketemu cukup dicatat di kolom catatan. Perilaku agent nggak diubah.
- Foto diambil saat responden mengerjakan tugas, hanya kalau izinnya dicentang.

## C. Tugas pemilik (akun `owner`)

| No | Kalimat yang dibacakan | Kunci untuk pendamping (bukan untuk dinilai) | Dibantu | Model error | Catatan |
|---|---|---|---|---|---|
| 1 | "Silakan Bapak/Ibu tanya ke asisten: tali kipas di gudang masih ada berapa? Setelah itu, silakan tanya hal di luar urusan toko, misalnya cuaca besok." | Di `/chat`, "tali kipas" = **V-Belt Alternator**. Stok awal di seed: Toko 8, Gudang 20. Pertanyaan iseng seharusnya ditolak dengan sopan. | ☐ | ☐ | |
| 2 | "Barusan datang 5 busi NGK ke gudang. Silakan Bapak/Ibu catat lewat asisten." | Busi NGK Copper, barang masuk 5 ke Gudang (awal 80 → 85). Muncul dialog PIN, lalu responden ketik PIN dan konfirmasi. | ☐ | ☐ | |
| 3 | "Sekarang silakan catat 2 filter oli keluar dari toko. Waktu diminta PIN, anggap saja salah catat, jadi silakan dibatalkan." | Filter Oli Mahle, keluar 2 dari Toko. Di dialog PIN, tekan **Batal**. Stok tetap (Toko 25). | ☐ | ☐ | |
| 4 | *(Pendamping matikan hotspot dulu.)* "Internet sedang mati. Silakan Bapak/Ibu cek stok tali kipas di toko." | Header chat menunjukkan **"Offline · data stok terakhir …"**, dan ada keterangan "Sedang offline…". Jawaban diambil dari data tersimpan (Toko 8). Nyalakan hotspot lagi sesudahnya. | ☐ | ☐ | |
| 5 | "Terakhir, silakan cari di menu admin barang apa saja yang sebaiknya dipesan lagi." | Portal Admin → menu **Saran Belanja Ulang** (`/admin/reorder`). Responden menyebut satu-dua barang dari daftar itu. Pastikan saat dry run daftarnya nggak kosong. | ☐ | ☐ | |

## D. Tugas staf (akun `gudang1`)

| No | Kalimat yang dibacakan | Kunci untuk pendamping (bukan untuk dinilai) | Dibantu | Model error | Catatan |
|---|---|---|---|---|---|
| 1 | "Silakan Bapak/Ibu tanya ke asisten: sokbreker di toko ada berapa? Setelah itu, silakan tanya hal di luar urusan toko, misalnya resep nasi goreng." | "sokbreker" = **Shock Absorber Belakang Bilstein**. Stok awal di seed: Toko 4, Gudang 6. Pertanyaan iseng seharusnya ditolak dengan sopan. | ☐ | ☐ | |
| 2 | "Silakan pindahkan 3 kampas rem dari gudang ke toko, dicatat lewat asisten." | Kampas Rem Depan Bosch, transfer 3 dari Gudang ke Toko (Gudang 16 → 13, Toko 10 → 13). Muncul dialog PIN, lalu responden konfirmasi. | ☐ | ☐ | |
| 3 | "Silakan catat 1 wiper keluar dari toko. Waktu diminta PIN, silakan dibatalkan." | Bilah Wiper Bosch 20 inch, keluar 1 dari Toko. Di dialog PIN, tekan **Batal**. Stok tetap (Toko 14). | ☐ | ☐ | |
| 4 | *(Pendamping matikan hotspot dulu.)* "Internet sedang mati. Silakan Bapak/Ibu cek stok kampas rem di gudang." | Header **"Offline · data stok terakhir …"**. Jawaban dari data tersimpan, jadi angkanya bisa masih angka **sebelum** transfer di tugas 2. Nyalakan hotspot lagi. | ☐ | ☐ | |
| 5 | "Ada pelanggan membeli 1 filter oli dan membayar tunai. Silakan dilayani di kasir." | `/pos` (shift sudah dibuka pendamping). Tambah Filter Oli Mahle ke keranjang, pilih bayar tunai, selesaikan. Struk muncul. | ☐ | ☐ | |

## E. Sesudah UAT

- [ ] Cek di sheet jawaban: ada 2 kiriman, satu per responden.
- [ ] Pindahkan foto ke folder skripsi (jangan ke repo).
- [ ] Sebelum run `/eval` berikutnya, **jalankan ulang `supabase/seed_eval.sql` lalu klik "Reset data eval"**, karena UAT mengubah stok tenant eval.
- [ ] Bab III (3.2), Bab IV, dan `perbedaan-rancangan.tex` disesuaikan sesudah data masuk. Waktu tugas dan pembanding Portal Admin nggak dipakai. Kalimat di Bab I diputuskan terpisah.
