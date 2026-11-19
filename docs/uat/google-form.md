# Google Form UAT Stokgent

Form dibuat otomatis oleh [buat-form.gs](buat-form.gs). Teks semua soal ada di script itu (bagian `TUGAS_PEMILIK`, `TUGAS_STAF`, `SOAL_SUS`, `SOAL_CHAT`). Kalau mau mengubah kalimat, ubah di script, lalu jalankan ulang.

Form yang dipakai pada UAT 19 November 2026 sempat diedit manual di Google Forms. Sesudah UAT, isi script disamakan dengan form final itu (dicek dari screenshot form di Lampiran 11 skripsi dan ekspor jawaban), jadi menjalankan script sekarang menghasilkan form yang sama.

## Cara membuat

1. Buka https://script.google.com → **Proyek baru**.
2. Hapus isi `Code.gs`, tempel seluruh isi `buat-form.gs`, lalu simpan.
3. Pilih fungsi **`cekScript`** → **Jalankan**. Log harus menulis "cekScript lulus".
4. Pilih fungsi **`buatForm`** → **Jalankan**. Izinkan akses ke Forms, Sheets, dan Drive.
5. Buka **Log eksekusi**. Di sana ada link untuk responden, link edit form, link spreadsheet jawaban, dan link pendek untuk responden (kalau berhasil dibuat). Baris terakhir harus "Tab Rekap sudah diisi rumus."
6. Buat QR dari link responden. Di Chrome: buka link-nya → ikon bagikan di kolom alamat → **Buat kode QR**.
7. Kirim satu jawaban uji, cek tab **Rekap** di spreadsheet, lalu hapus jawaban uji itu (Form → Respons → titik tiga → Hapus semua respons, lalu hapus barisnya di tab Jawaban).

Tiap kali `buatForm` dijalankan, script membuat form dan spreadsheet **baru** dengan tanggal-jam di namanya. Form lama nggak disentuh, jadi hapus sendiri dari Drive kalau nggak dipakai.

## Isi form

| Halaman | Isi |
|---|---|
| 1. Persetujuan | Deskripsi form berisi lembar penjelasan (informed consent): perkenalan peneliti, tujuan, kegiatan, risiko, kerahasiaan, kesukarelaan, dan tempat bertanya. Di bawahnya ada "Pernyataan persetujuan": bersedia → lanjut, tidak bersedia → form langsung selesai. |
| 2. Izin dan identitas | Nama dan peran di toko. Pemilik diarahkan ke halaman 3, staf ke halaman 4. |
| 3 / 4. Uji Coba | 5 percobaan sesuai peran, masing-masing Berhasil / Kurang sesuai ekspektasi / Gagal atau terdapat error, dengan keterangan di bawah judulnya. Ditambah 1 komentar opsional. |
| 5. Pendapat tentang aplikasi | SUS 10 soal, skala 1-5, urutan tetap. Petunjuk menjelaskan arti angka 1-5. |
| 6. Pendapat tentang asisten chat | 10 soal chat skala 1-5, ditambah 1 komentar akhir opsional. |

Catatan: paragraf "Kerahasiaan data" di halaman 1 masih menyebut nama pendek dan foto hanya dicantumkan bila diizinkan "pada halaman berikutnya", padahal halaman 2 form final tidak memuat pertanyaan izin. Kalau form dipakai lagi, tambahkan pertanyaan izinnya atau ubah kalimat itu.

Pengaturan yang dipasang script:
- Nada bahasanya Bapak/Ibu, dengan bar kemajuan.
- Email nggak dikumpulkan dan responden nggak perlu login Google.
- Urutan soal nggak diacak, dan jawaban nggak bisa diedit setelah dikirim.
- Sesudah kirim cuma muncul ucapan terima kasih.

Tema dibiarkan bawaan Google tanpa gambar header, karena Apps Script memang nggak bisa mengatur tema.

## Catatan sitasi SUS

Urutan dan arah soal SUS mengikuti SUS asli (Brooke, 1996): soal ganjil bernada positif, soal genap bernada negatif. Kalimatnya terjemahan bebas. Kalau di skripsi mau menyebut adaptasi Bahasa Indonesia yang sudah divalidasi (Sharfina & Santoso, 2016), cocokkan dulu kalimat di `SOAL_SUS` dengan makalah itu sebelum form dibuat. Soal chat C1-C10 bukan bagian SUS dan nggak dihitung ke skor SUS.
