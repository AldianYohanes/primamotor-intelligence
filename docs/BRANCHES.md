# Peta branch

Diperbarui 12 November 2026. Repo ini tidak di-push dari sesi kerja lokal; merge ke `master` hanya atas keputusan Aldian.

## Keadaan sekarang

`master` (c6ac202) sudah memuat semua pekerjaan aktif. Isinya, digabung 4 November 2026:

- `agent/qwen3-small` (876ff7e), yang sendiri sudah memuat `rc/uji-program`, `fix2-gabungan`, `ui/*`, `eval/*`, `agent/router-think`, dan `agent/refactor-orchestrator`.
- `agent/koreksi-stok` (76ff014). Satu bentrok di `stock-summary.test.ts` diselesaikan dengan menyimpan kedua blok tes.
- Dua commit `master` lama (merge `fix2-gabungan` dan perbaikan galat API admin).

Hasil uji `master` (4 November): `vitest run` 703 tes lulus, `tsc --noEmit` bersih.

Digabung lagi ke `master` lokal (tanpa push) pada 11 November 2026:

- `agent/dead-stock` (sudah sama dengan `master` sebelumnya).
- `agent/tampilan-abu`: mode gelap (terang/gelap/ikut sistem), halaman Pengaturan, jarak Padat/Sedang/Lega, latar gradien, kerangka muat, dan versi abu-abu netral dengan pita sutra. Dipilih menggantikan warna gelap awal di `agent/tampilan`.
- `agent/tampilan`: saklar "Detail teknis di chat" per akun (kolom `staff.show_model_details`, migrasi `0040`, default mati). **Migrasi 0040 sudah dijalankan di Supabase hosted.**
- `agent/qwen3-small` (31a3c60): impor bon tetap terbuka bila semua baris yang dikonfirmasi gagal mencatat stok.

Hasil uji sesudah gabung: `vitest run` 733 tes lulus, `tsc --noEmit` bersih. Saat itu `bun run lint` masih punya 5 galat lama (sudah selesai 12 November, lihat di bawah).

Pada 12 November 2026, 5 galat lint lama (TenantApprovalList, EnableNotificationsBanner, online-status, pos-terminal) diselesaikan di `master`: `online-status` memakai `useSyncExternalStore`, sisanya diberi komentar `eslint-disable` beserta alasan. `bun run lint` sekarang 0 galat (6 peringatan). `vitest run` 733 tes lulus, `tsc --noEmit` bersih.

Pada 13 November 2026, `fix/pending-queue-skip-rejected` (38a1725) digabung ke `master` lokal (b4a9237, tanpa push): antrean pesan offline membuang pesan yang ditolak server secara permanen (kode 42501 atau 23503) supaya satu pesan yatim tidak menahan seluruh antrean. Terbukti di aplikasi (39 pesan tertahan menjadi 0); belum diuji ulang di `/eval`. Branch-nya aman dihapus.

Yang **tidak** masuk: `agent/effort-akurasi` (tingkat cepat/normal/teliti dengan Router voting, dan `search_products_fuzzy`). Bentroknya di inti Router (14 bagian di `agent-loop.ts`, `EvalRunner.tsx`, `router-step.ts`, `run-store.ts`) karena `master` memakai Router versi baru. Disimpan sebagai tag `arsip/effort-akurasi` (76e9fb0). Mau dipakai lagi, fitur voting harus ditulis ulang di atas Router yang sekarang dan diuji ulang.

## Branch dan folder kerja yang masih ada

Semua branch berikut isinya sudah ada di `master` (kecuali `agent/effort-akurasi`), jadi aman dihapus kapan saja. Belum dihapus atas permintaan Aldian.

| Branch | Folder kerja | Status |
|---|---|---|
| `agent/qwen3-small` | `primamotor-qwen3-small` | sudah di `master` (termasuk perbaikan bon 11 November) |
| `agent/koreksi-stok` | `primamotor-koreksi-stok` | sudah di `master` |
| `rc/uji-program` | `primamotor-rc-uji-program` | sudah di `master` |
| `fix2-gabungan` | `primamotor-fix2-gabungan` | sudah di `master` |
| `agent/effort-akurasi` | `primamotor-effort` | sengaja tidak di `master` (keputusan 11 November: tetap diarsipkan); ada tag `arsip/effort-akurasi` |
| `agent/tampilan`, `agent/tampilan-abu`, `agent/dead-stock` | `primamotor-tampilan` (abu), `primamotor-deadstock` | sudah di `master` (11 November) |
| `agent/refactor-orchestrator`, `agent/router-think`, `eval/tooling`, `eval/model-kecil`, `ui/chat`, `ui/pos`, `ui/dashboard`, `ui/new-pages` | (tanpa folder) | sudah di `master` |
| `eval/kondisi-pembanding` | (tanpa folder) | sudah di `master` (4 November 2026), aman dihapus |

## Arsip (tag, bukan branch)

- `arsip/master-sebelum-gabung` (c3aa0a4): `master` tepat sebelum digabung, untuk jalan mundur.
- `arsip/effort-akurasi` (76e9fb0): lihat di atas.
- `arsip/eval-h-baseline` (ac0f662): kode sebelum perbaikan pasca-evaluasi + skenario H; pembanding Run 34, 35, 41.
- `arsip/development` (2013e26): branch lama 27 Sep 2026; 4 commit tidak ada di master, diduga tergantikan.
- `eval-freeze-1` sampai `eval-freeze-6`, termasuk `eval-freeze-3b`: titik beku run evaluasi. `eval-freeze-6` (4 November 2026) memuat dua saklar pembanding di `/eval` (single-agent dengan pengaman setara, router kode), Saga sebagai model bawaan, dan WebLLM dipasang pasti di 0.2.84. Dipakai untuk run final.
- `backup-before-trailer-strip`: tag lama, asal tidak tercatat di sini.

## Catatan

- Remote `origin` sebelumnya menunjuk ke repo portofolio (`aldianyhs`); sejak 4 November 2026 diarahkan ke `https://github.com/AldianYohanes/primamotor-intelligence`. Belum pernah di-fetch atau di-push dari sini. Ref `origin/*` yang tersimpan lokal masih sisa repo portofolio, jadi angka "ahead/behind" terhadap `origin/master` belum berarti sampai `git fetch` pertama.
- `bun test src` gagal memuat beberapa file karena paket `server-only`. Runner resmi: `bunx vitest run`.
- `supabase/seed.sql` ada di folder ini sebagai berkas tidak terlacak setelah gabung; periksa sebelum dihapus.

## Aturan

- Branch baru dinamai per area: `agent/…`, `eval/…`, `ui/…`, `rc/…` untuk gabungan uji.
- Branch yang isinya sudah masuk branch lain dihapus; kode yang perlu dirujuk lagi disimpan sebagai tag `arsip/…`.
- Jangan edit worktree tempat `/eval` sedang berjalan (hot reload memutus GPU).
