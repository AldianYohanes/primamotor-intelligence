-- 0040_staff_show_model_details.sql
-- Saklar per akun: tampilkan statistik model dan detail proses di chat.
-- Default mati supaya staf biasa tidak melihat angka teknis.

alter table staff
  add column show_model_details boolean not null default false;

-- Hak update kolom pada staff dibatasi (0034), jadi pengguna mengubah saklarnya
-- sendiri lewat fungsi ini. Hanya baris milik auth.uid() yang berubah.
create or replace function set_show_model_details(p_value boolean) returns void as $$
  update staff set show_model_details = p_value where auth_user_id = auth.uid();
$$ language sql security definer set search_path = public;

revoke all on function set_show_model_details(boolean) from public, anon;
grant execute on function set_show_model_details(boolean) to authenticated;
