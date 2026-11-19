# Rekap Hasil UAT (SUS, soal chat, tugas)

Tab **Rekap** di spreadsheet jawaban sudah diisi rumus oleh [buat-form.gs](buat-form.gs), jadi nggak perlu menyalin rumus manual. Jawaban mentah ada di tab **Jawaban**. Jangan menambah kolom di tab Jawaban, karena Google Form bisa menggeser kolomnya.

## Isi tab Rekap

Ada 5 baris slot (baris 2-6), satu baris per kiriman form. Kiriman yang memilih "tidak bersedia" di persetujuan dibiarkan kosong. Baris 8 berisi rata-rata.

| Kolom | Isi |
|---|---|
| A | Kode P1, P2 (**isi sendiri**) |
| B, C | Nama pendek, peran |
| D | Skor SUS |
| E, F, G | Jumlah percobaan Berhasil / Kurang sesuai ekspektasi / Gagal atau terdapat error |
| H-Q | Jawaban C1-C10 (soal chat) |

Cara hitung skor SUS: soal ganjil (positif) jadi **jawaban − 1**, soal genap (negatif) jadi **5 − jawaban**. Hasilnya dijumlah (paling tinggi 40), lalu dikali 2,5. Soal chat dilaporkan per soal, nggak dijadikan satu skor, dan nggak dicampur ke SUS.

## Letak kolom di tab Jawaban (buat cek manual)

| Kolom | Isi |
|---|---|
| A | Stempel waktu |
| B | Persetujuan |
| C, D | Nama, peran |
| E-I, J | Percobaan 1-5 pemilik, komentar pemilik |
| K-O, P | Percobaan 1-5 staf, komentar staf |
| Q-Z | S1-S10 (SUS) |
| AA-AJ | C1-C10 (soal chat) |
| AK | Komentar akhir |

Letak ini sama dengan ekspor jawaban UAT 19 November 2026.

## Cek pakai jawaban uji

Kirim satu jawaban uji dan cocokkan skor SUS di Rekap dengan tabel ini. Rumusnya sudah dicek dengan hitungan terpisah.

| Jawaban S1-S10 | Skor harus |
|---|---|
| semua 3 | 50 |
| ganjil 5, genap 1 | 100 |
| ganjil 1, genap 5 | 0 |
| 4, 2, 4, 2, 3, 2, 4, 2, 4, 2 | 72,5 |

## Hasil UAT 19 November 2026

Dua peserta (P1 pemilik, P2 staf Prima Motor Volvo), di Lippo Mall Puri, laptop Adreno X1-45 dengan Qwen2.5-3B, versi online program. Karena pesertanya kurang dari tiga, hasil dilaporkan **kualitatif per peserta**, tanpa rata-rata. Uraian lengkapnya ada di skripsi: Bab IV subbab *User Acceptance Testing* dan Lampiran 11.

| | P1 (pemilik) | P2 (staf) |
|---|---|---|
| Percobaan 1-5 | semua Berhasil | semua Berhasil |
| SUS S1-S10 | 4, 1, 5, 4, 4, 1, 4, 2, 4, 2 | 5, 1, 5, 2, 5, 1, 5, 1, 4, 3 |
| Skor SUS | 77,5 | 90 |
| Chat C1-C10 | 5, 4, 4, 3, 5, 5, 5, 4, 4, 4 | 5, 5, 4, 3, 5, 5, 5, 5, 5, 5 |

Selama sesi nggak ada tugas yang dibantu, nggak ada galat model atau GPU, dan nggak ada tugas yang lewat 5 menit. Nilai terendah ada di C4 (lama menunggu jawaban), dari kedua peserta. Komentar tertulis: P1 menilai program mempermudah cek barang dan pencatatan transaksi, P2 menyarankan jawaban asisten dibuat lebih natural. Komentar lisan: tahap awal merepotkan karena semua barang harus diinput dulu, dan data perlu dicocokkan secara berkala.

Skripsi menafsirkan skor SUS dengan skala kata sifat Bangor dkk. (2009), bukan dengan batas lulus.
