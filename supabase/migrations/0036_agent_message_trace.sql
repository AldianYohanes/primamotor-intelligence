-- "Lihat proses" asisten: langkah terstruktur satu giliran (Router, alat +
-- argumen, ringkasan hasil, tindakan kode) disimpan per pesan asisten supaya
-- bisa dibuka lagi setelah muat ulang atau dari Riwayat. Isinya versi ringkas
-- (lihat src/lib/agents/process-trace.ts), bukan respons alat utuh.
-- Nullable: pesan lama dan pesan staf tidak punya trace. RLS agent_messages
-- (0019, per tenant lewat agent_conversations) berlaku apa adanya.

alter table agent_messages
  add column trace jsonb;
