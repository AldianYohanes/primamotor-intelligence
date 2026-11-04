-- 0032_business_ocr_consent.sql
--
-- §15.3 (Known Issue): §6 project instructions mewajibkan disclosure eksplisit
-- ke pemilik toko bahwa foto bon (bisa memuat harga beli/data supplier) dikirim
-- ke Gemini API (Google, pihak ketiga) untuk OCR — tapi belum ada tempat untuk
-- merekam consent itu. Kolom ini SENGAJA di tabel `businesses` (bukan per-staf)
-- karena keputusan ini levelnya kebijakan toko, bukan preferensi personal staf,
-- konsisten dengan siapa yang tanda tangan alur signup (owner toko).
--
-- Nullable & tanpa default `true` supaya tenant LAMA (dibuat sebelum migration
-- ini) otomatis punya `ocr_consent_given_at = null` alih-alih dianggap sudah
-- consent secara diam-diam — itu sama saja bohong soal histori consent asli.
-- Konsekuensinya: tenant lama TIDAK diblokir otomatis dari fitur OCR di
-- migration ini (belum ada guard runtime ditambahkan di route OCR) — itu
-- keputusan produk terpisah yang perlu didiskusikan (retroactive consent flow
-- lewat halaman admin, atau soft-block dengan reminder), dicatat sebagai gap
-- lanjutan, bukan diselesaikan diam-diam di sini.

alter table businesses
  add column ocr_consent_given_at timestamptz;

comment on column businesses.ocr_consent_given_at is
  'Waktu owner menyetujui disclosure bahwa foto bon dikirim ke Gemini API (Google) untuk OCR. NULL = belum pernah consent eksplisit (mis. tenant dibuat sebelum migration ini, atau signup lama tanpa checkbox).';
