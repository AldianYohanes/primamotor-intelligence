-- 0022_ocr_rate_limit.sql — §12 gap: OCR Gemini (cloud, berbayar per-panggilan) belum
-- punya rate limiting apa pun. Endpoint lain (chat, RPC stok) tidak butuh ini karena
-- WebLLM on-device (gratis, tidak ada biaya per-panggilan ke pihak ketiga) — OCR beda
-- karena tiap upload foto bon = 1 panggilan Gemini API berbayar (lihat lib/ocr/gemini.ts).
--
-- Pendekatan: fixed-window counter per business_id, increment atomik lewat
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING (row lock Postgres pada baris yang
-- konflik menjamin ini aman dari race condition antar request bersamaan — TIDAK
-- butuh advisory lock atau SELECT ... FOR UPDATE terpisah). Sengaja bukan sliding-window
-- log per-request (tabel akan tumbuh tanpa batas & butuh query agregasi tiap cek) — fixed
-- window jauh lebih murah dan cukup akurat untuk kebutuhan cegah biaya membengkak ini.

create table ocr_rate_limit_windows (
  business_id uuid not null references businesses(id) on delete cascade,
  window_start timestamptz not null,
  request_count int not null default 0,
  primary key (business_id, window_start)
);

-- Index buat query "lihat pemakaian bulan ini" dsb kalau dibutuhkan nanti — bukan
-- dipakai increment_ocr_rate_limit sendiri (itu selalu exact-match primary key).
create index idx_ocr_rate_limit_business_window on ocr_rate_limit_windows (business_id, window_start desc);

alter table ocr_rate_limit_windows enable row level security;

-- Baca/tulis dibatasi ke tenant sendiri, staf mana pun (bukan cuma full_access) —
-- konsisten dengan receipt-imports yang juga tidak dibatasi role tertentu.
create policy "ocr_rate_limit read own tenant" on ocr_rate_limit_windows for select
  using (business_id = auth_business_id() or is_super_admin());
create policy "ocr_rate_limit write own tenant" on ocr_rate_limit_windows for insert
  with check (business_id = auth_business_id());
create policy "ocr_rate_limit update own tenant" on ocr_rate_limit_windows for update
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Sengaja BUKAN security definer — sama seperti record_stock_transaction/transfer_stock
-- di 0013_stock_rpc.sql, RPC ini jalan dengan hak akses pemanggil (RLS di atas yang jadi
-- penjaga), bukan bypass RLS. Dipanggil dari Route Handler lewat requireStaff() (RLS-respecting
-- client), BUKAN admin client — ini bukan salah satu dari dua pengecualian createAdminClient() di §5.
create or replace function increment_ocr_rate_limit(
  p_business_id uuid, p_window_minutes int, p_max_requests int
) returns table(allowed boolean, current_count int, limit_count int, window_start timestamptz) as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  -- Window dibulatkan ke kelipatan p_window_minutes sejak epoch — bukan date_trunc('hour', ...)
  -- supaya bisa dipakai untuk window_minutes berapa pun (15, 60, 1440, dst), bukan cuma jam bulat.
  v_window_start := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));

  insert into ocr_rate_limit_windows (business_id, window_start, request_count)
  values (p_business_id, v_window_start, 1)
  on conflict (business_id, window_start)
  do update set request_count = ocr_rate_limit_windows.request_count + 1
  returning ocr_rate_limit_windows.request_count into v_count;

  return query select (v_count <= p_max_requests), v_count, p_max_requests, v_window_start;
end;
$$ language plpgsql;
