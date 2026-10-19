# CLAUDE.md

Petunjuk untuk asisten AI yang mengerjakan repo ini. Gambaran proyek dan cara menjalankan ada di `README.md`; peta branch di `docs/BRANCHES.md`.

- Paket: Bun (`bun install`, `bun dev`). Test: `bunx vitest run` (bukan `bun test`). Lint: `bun run lint`.
- Komentar kode dan teks tampilan berbahasa Indonesia; pesan commit conventional commit berbahasa Inggris, per fitur.
- Pertahankan line ending file (CRLF di working copy).
- Perilaku agent (`src/lib/agents/`: prompt, pengaman, urutan langkah) dipakai sebagai dasar evaluasi skripsi. Jangan ubah tanpa keputusan pemilik repo; perubahan perilaku dikerjakan di branch terpisah dan diuji ulang di `/eval`.
- Jangan edit worktree tempat `/eval` sedang berjalan (hot reload memutus koneksi GPU) dan hindari perintah berat di mesin yang sama selama run.
- Migrasi database di `supabase/migrations/` bernomor urut; tambah file baru, jangan ubah migrasi yang sudah dijalankan. Isi seed evaluasi ada di `supabase/seed_eval.sql` dan `src/lib/eval/seed-data.ts`; ubah keduanya bersamaan.
- Jangan commit secret (`.env*`) dan jangan push tanpa izin pemilik repo.
