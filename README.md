# Stokgent — Prima Motor Intelligence

Aplikasi stok dan kasir untuk bengkel Prima Motor (spesialis Volvo), dengan asisten chat multi-agent yang berjalan di browser. Dibuat untuk skripsi S1 Teknik Informatika.

- **Stok dua lokasi** (Toko dan Gudang): cek stok, kartu stok per barang, transfer, stock opname, saran belanja ulang.
- **Kasir (POS)**: shift, penjualan, pembayaran terpisah, pelanggan, garansi, struk.
- **Asisten chat** (`/chat`): Router memilih Query Agent (cek stok, tren penjualan) atau Transaction Agent (barang masuk, keluar, pindah). Model bahasa (Qwen2.5-3B lewat WebLLM) berjalan di GPU perangkat, jadi data stok tidak dikirim ke layanan LLM luar. Semua perubahan stok dari chat harus dikonfirmasi PIN staf.
- **Monitoring Agent**: dijalankan terjadwal (Vercel Cron, `vercel.json`), menghitung titik pesan ulang dan membuat saran restock serta notifikasi. Tidak mengubah stok.
- **Evaluasi** (`/eval`): menjalankan skenario uji multi-agent vs single-agent di browser dan mengekspor JSON/CSV untuk Bab 4.

## Teknologi

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Supabase (Postgres, Auth, RLS, Storage), WebLLM (`@mlc-ai/web-llm`), PWA (Serwist, IndexedDB untuk cache offline), Web Push. Paket dikelola dengan Bun (`bun.lock`).

## Menjalankan secara lokal

1. Pasang dependensi:

   ```bash
   bun install
   ```

2. Buat `.env.local` berisi variabel di bawah (nilai diambil dari project Supabase dan konfigurasi masing-masing; jangan di-commit).

   | Variabel | Keperluan |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | koneksi Supabase dari browser |
   | `SUPABASE_SERVICE_ROLE_KEY` | route server yang butuh melewati RLS (konfirmasi PIN, cron, login) |
   | `STAFF_AUTH_EMAIL_DOMAIN` | domain email sintetis akun staf (login pakai kode toko + username + PIN) |
   | `CRON_SECRET` | wajib untuk `/api/cron/monitor`; tanpa nilai ini cron selalu ditolak |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | push notification |
   | `GEMINI_API_KEY`, `OCR_RATE_LIMIT_MAX`, `OCR_RATE_LIMIT_WINDOW_MINUTES` | impor nota lewat OCR |
   | `ENABLE_EVAL_PAGE` | `true` untuk mengaktifkan `/eval` (hanya di tenant evaluasi) |
| `SEED_STAFF_PIN` | opsional, PIN (minimal 6 digit) untuk akun kasir dan staf gudang yang dibuat tombol "Reset data eval". Isi di `.env.local` saja. Kalau kosong, dipakai PIN acak yang tidak disimpan |

3. Siapkan database: jalankan file di `supabase/migrations/` berurutan (`0001` sampai `0038`) di SQL editor Supabase atau lewat Supabase CLI.

4. Jalankan:

   ```bash
   bun dev
   ```

   Asisten chat butuh browser dengan WebGPU (Chrome/Edge terbaru) dan GPU dengan memori cukup (Qwen2.5-3B q4f16 ±2,5 GB). Model diunduh sekali lalu disimpan di cache browser. Spesifikasi minimal dan rekomendasi: [docs/system-requirements.md](docs/system-requirements.md).

## Tenant evaluasi

`supabase/seed_eval.sql` membuat tenant terpisah `eval-prima-motor` (17 produk sintetis, Toko + Gudang, riwayat penjualan 6 bulan) supaya skenario transaksi tidak mengubah data toko asli. Cara pakai ada di komentar awal file itu (buat auth user evaluator dulu). Setelah tenant ada, data bisa direset dari tombol **Reset data eval** di `/eval`; isi seed juga disalin di `src/lib/eval/seed-data.ts`, jadi ubah keduanya bersamaan.

Skenario uji ada di `src/lib/eval/scenarios.json`. Laporan dari hasil ekspor:

```bash
bun scripts/eval-report.ts <hasil.json> --out <folder>
```

Bandingkan dua run per skenario (pulih, turun, McNemar, per kelompok skenario):

```bash
bun scripts/eval-compare.ts <sebelum.json> <sesudah.json> --out banding.md
```

## Test

```bash
bunx vitest run
bun run lint
```

Pakai `vitest`, bukan `bun test`: beberapa file mengimpor paket `server-only` yang disediakan Next.js dan tidak bisa dimuat runner Bun.

## Struktur

| Folder | Isi |
|---|---|
| `src/app/` | halaman (App Router) dan route API (`api/agent`, `api/admin`, `api/cron`, `api/eval`, …) |
| `src/lib/agents/` | Router, agent, protokol tool call, pengaman, jawaban dari kode; alur satu giliran di `turn/` |
| `src/lib/eval/`, `src/components/eval/` | skenario, penilaian, dan halaman `/eval` |
| `src/modules/` | modul admin dan POS (pola `data/`, `services/`, `hooks/`, `mappers/`, `Component.tsx`) |
| `src/components/chat/` | tampilan asisten chat |
| `supabase/` | migrasi, seed tenant evaluasi, test integrasi RLS |
| `docs/` | peta branch dan audit UX |
