# Peta branch

Ditata 19 Oktober 2026. Repo ini tidak di-push dari sesi kerja lokal; merge ke `master` hanya atas keputusan Aldian.

## Alur

```
master (0bd22eb, tag eval-freeze-4, sama dengan origin/master)
├── fix2-gabungan          putaran perbaikan kedua + alat eval (reset data, modal error)
│   ├── agent/refactor-orchestrator   orchestrator.ts dipecah ke src/lib/agents/turn/, perilaku sama
│   ├── agent/router-think            Router dan jawaban kebal blok <think>, mode berpikir Qwen3 dimatikan
│   ├── eval/tooling                  commit di ekspor, test stok terkuras, faithfulness "kosong", progres besar
│   └── rc/uji-program                gabungan semua branch aktif, untuk diuji sekali sebelum uji program 2 Nov
├── eval/model-kecil       pilihan model Qwen3 1.7B dan Gemma 3 1B (dipakai Run 41)
├── ui/chat                UX chat staf (audit: docs/ux-audit-chat.md)
├── ui/pos                 kasir lebih cepat (audit: docs/ux-audit-pos.md)
├── ui/dashboard           grafik penjualan, terlaris, stok menipis (audit: docs/ux-audit-dashboard.md)
└── ui/new-pages           kartu stok, saran belanja ulang, akun/ganti PIN, pusat notifikasi
```

`rc/uji-program` = `fix2-gabungan` + semua branch di atas, digabung urut: refactor, router, eval/tooling, eval/model-kecil, ui/dashboard, ui/pos, ui/chat, ui/new-pages. Satu-satunya bentrok (orchestrator: router vs refactor) diselesaikan dengan memindahkan perubahan router ke modul `turn/` (stream, router-step, agent-loop, final-answer).

## Status uji

| Branch | Test | Diuji dengan model | Dicek di browser |
|---|---|---|---|
| fix2-gabungan | lulus | Qwen2.5-3B (Run 38, sebelum `48f3f08`); Llama-3.2-3B sedang jalan | eval saja |
| agent/router-think | lulus | belum (perlu run Qwen2.5 pendek skenario Q dan O) | belum |
| agent/refactor-orchestrator | lulus | belum | belum |
| ui/* | lulus | tidak perlu | belum (butuh login PIN) |
| rc/uji-program | vitest 536/536, typecheck lulus | belum | belum |

`bun test src` gagal memuat 5-6 file karena paket `server-only` tidak terpasang; sudah begitu di `master`. Runner resmi `vitest run` lulus.

## Urutan merge ke master (usulan, keputusan Aldian)

1. Tunggu hasil run Llama-3.2-3B di `fix2-gabungan`, lalu merge `fix2-gabungan` + tag `eval-freeze-5`.
2. `agent/refactor-orchestrator`, lalu `agent/router-think` (bentrok di orchestrator; contoh penyelesaian ada di commit merge `rc/uji-program`).
3. `eval/tooling`, `eval/model-kecil`.
4. `ui/*` setelah dicoba di browser.

Atau: setelah `rc/uji-program` lolos uji di browser dan run singkat, merge `rc/uji-program` sekaligus.

## Arsip (tag, bukan branch)

- `arsip/eval-h-baseline` (ac0f662): kode sebelum perbaikan pasca-evaluasi + skenario H; pembanding Run 34, 35, 41.
- `arsip/development` (2013e26): branch lama 27 Sep 2026; 4 commit tidak ada di master, diduga tergantikan.
- `eval-freeze-1` … `eval-freeze-4`: titik beku run evaluasi.

## Aturan

- Branch baru dinamai per area: `agent/…`, `eval/…`, `ui/…`, `rc/…` untuk gabungan uji.
- Branch yang isinya sudah masuk branch lain dihapus; kode yang perlu dirujuk lagi disimpan sebagai tag `arsip/…`.
- Jangan edit worktree tempat `/eval` sedang berjalan (hot reload memutus GPU).
