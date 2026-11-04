-- 0037_fix_ocr_rate_limit_ambiguity.sql
--
-- Perbaikan increment_ocr_rate_limit (0022). Fungsi PL/pgSQL ini punya kolom
-- keluaran `window_start` (returns table) yang namanya sama dengan kolom tabel
-- ocr_rate_limit_windows, sehingga `on conflict (business_id, window_start)`
-- ditolak PostgreSQL: 42702 "column reference window_start is ambiguous".
-- Akibatnya setiap impor nota OCR gagal ("Gagal memeriksa rate limit OCR"),
-- karena src/lib/rate-limit/ocr-rate-limit.ts sengaja fail-closed.
--
-- Ditemukan 9 Okt 2026 lewat supabase/tests/rls.test.sql (test 14) di PGlite,
-- dikonfirmasi di DB live (impor nota di Review Bon gagal).
-- `#variable_conflict use_column` membuat nama yang bentrok dibaca sebagai
-- kolom tabel; isi fungsi selain itu sama persis dengan 0022.

create or replace function increment_ocr_rate_limit(
  p_business_id uuid, p_window_minutes int, p_max_requests int
) returns table(allowed boolean, current_count int, limit_count int, window_start timestamptz) as $$
#variable_conflict use_column
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));

  insert into ocr_rate_limit_windows (business_id, window_start, request_count)
  values (p_business_id, v_window_start, 1)
  on conflict (business_id, window_start)
  do update set request_count = ocr_rate_limit_windows.request_count + 1
  returning ocr_rate_limit_windows.request_count into v_count;

  return query select (v_count <= p_max_requests), v_count, p_max_requests, v_window_start;
end;
$$ language plpgsql;
