// Sumber tipe yang BENAR ada di `src/lib/db/types.ts` (ditulis manual
// mengikuti seluruh migration, §15.2). File ini sebelumnya adalah placeholder
// kosong (`Tables: Record<string, never>`) yang TIDAK disambungkan ke
// `createClient<Database>` manapun — artinya semua `.from('table')` di app
// ini tidak pernah benar-benar dicek terhadap kolom asli, meski
// `tsc --noEmit` lolos tanpa error.
//
// `server.ts` dan `client.ts` sudah lebih dulu mengimpor dari `db/types.ts`
// langsung. `middleware.ts` masih mengimpor dari file INI sampai diperbaiki
// — sekarang sudah ikut diarahkan ke `db/types.ts` juga, jadi file ini tidak
// lagi jadi satu-satunya sumber untuk siapapun di app. Re-export di bawah ini
// murni jaring pengaman kalau ada import lama/baru yang lupa menunjuk ke
// `db/types.ts` langsung.
//
// Kalau nanti generate ulang dari Supabase project asli
// (`npx supabase gen types typescript --project-id <id> --schema public`),
// output-nya diarahkan ke `src/lib/db/types.ts`, BUKAN file ini.
export type { Database, Json } from "@/src/lib/db/types";
