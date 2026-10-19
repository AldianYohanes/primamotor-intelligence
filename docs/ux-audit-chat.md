# Audit UX halaman chat staf

Dicek lewat baca kode (belum dilihat di browser/HP asli). Status: **Dikerjakan** / **Usulan** (butuh ubah agent, jadi tidak disentuh).

| # | Masalah | Dampak | Perbaikan | Status |
|---|---------|--------|-----------|--------|
| 1 | Keadaan kosong cuma teks contoh yang tidak bisa diketuk | Staf harus mengetik di HP | Empat tombol contoh pertanyaan, ketuk langsung terkirim | Dikerjakan |
| 2 | Tombol Kirim/Stop dan input kecil; font input 13px | Susah diketuk, iOS zoom otomatis saat fokus | Tinggi minimal 44px, font 16px di HP, `enterKeyHint=send`, aman dari poni/home bar | Dikerjakan |
| 3 | Enter terkirim saat keyboard HP masih menyusun kata; Kirim aktif walau kosong | Pesan terkirim setengah jadi | Cek `isComposing`, Kirim nonaktif kalau kosong | Dikerjakan |
| 4 | Tombol header (Riwayat, Percakapan Baru) cuma ikon di HP, tanpa label | Pembaca layar tidak tahu fungsinya, area ketuk kecil | `aria-label` dan ukuran minimal 40px | Dikerjakan |
| 5 | Pesan error "terjadi kesalahan, coba lagi ya" | Staf tidak tahu harus apa | Pesan dengan langkah berikutnya, beda untuk offline | Dikerjakan |
| 6 | Dialog PIN: input tidak bisa Enter, tidak ada petunjuk panjang PIN, tombol kecil, tanpa role dialog | Tombol Konfirmasi mati tanpa alasan jelas | Enter untuk konfirmasi, "masih kurang N angka", tombol 44px, `role=dialog`, error `role=alert` (aturan PIN tidak diubah) | Dikerjakan |
| 7 | Pilihan barang/lokasi: tombol kecil (12px) | Salah ketuk saat memilih barang | Tombol 40px, teks 14px, kartu lebih lebar di HP | Dikerjakan |
| 8 | Bubble pesan 80% lebar; teks panjang tanpa pemecah kata | Sempit di HP, teks bisa meluber | 90% di HP, `break-words` | Dikerjakan |
| 9 | Daftar chat tidak diumumkan ke pembaca layar; status "berpikir" abu-abu muda | Aksesibilitas, kontras rendah | `role=log`, status `role=status`, warna lebih gelap | Dikerjakan |
| 10 | Status pemuatan model (progres, kecepatan, perkiraan sisa waktu, jeda) | Sudah baik di `ModelSetupPanel` | Tidak perlu diubah | Tidak perlu |
| 11 | Jawaban stok berupa teks panjang, tidak ada kartu per lokasi | Susah dipindai di HP | Pesan hanya menyimpan teks dan ringkasan langkah (string terpotong 240 karakter), bukan data `getStock` terstruktur. Kartu butuh orchestrator menyimpan hasil tool di pesan | Usulan |
| 12 | Jawaban panjang tidak bisa diciutkan | Layar penuh teks | Setelah ada data terstruktur (no. 11), tampilkan ringkasan + "Lihat selengkapnya". Alternatif: batasi panjang di prompt | Usulan |
| 13 | Pesan gagal memuat riwayat hanya `console.error`; layar kosong | Staf tidak tahu riwayat gagal dimuat | Tampilkan pesan + tombol coba lagi (butuh uji manual dengan Supabase) | Usulan |
| 14 | Pesan tool-trace memakai istilah teknis ("Router menjawab", "deterministik") di "Lihat proses" | Membingungkan staf non-teknis | Ganti kata di `process-trace.ts` (folder agent, tidak disentuh) | Usulan |

## Belum diverifikasi
- Tampilan di browser dan HP asli (login butuh PIN, GPU dipakai eval). Hanya typecheck dan unit test.
- Komponen tidak punya test render (vitest di repo ini `node`, bukan jsdom); yang dites cuma helper murni di `chat-ui.ts`.
