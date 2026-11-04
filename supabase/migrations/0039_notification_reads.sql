-- 0039_notification_reads.sql
--
-- Status "sudah dibaca" notifikasi per staf.
--
-- Masalah: notifikasi dari Monitoring Agent dibuat tanpa staf tujuan (staff_id kosong)
-- dan berlaku untuk semua staf toko. Kolom notifications.read_at hanya bisa satu nilai,
-- dan RLS UPDATE-nya hanya mengizinkan baris milik sendiri, jadi tidak bisa dipakai.
-- Solusi: tabel terpisah, satu baris per (notifikasi, staf). Tabel notifications tidak diubah.

create table notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  staff_id        uuid not null references staff(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, staff_id)
);

create index idx_notification_reads_staff on notification_reads(staff_id);

alter table notification_reads enable row level security;

-- Staf hanya melihat dan menulis catatan baca miliknya sendiri, dan hanya untuk
-- notifikasi yang memang boleh ia lihat (toko sendiri; siaran atau ditujukan ke dia).
create policy "notification_reads read own" on notification_reads for select
  using (exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid()));

create policy "notification_reads insert own" on notification_reads for insert
  with check (
    exists (select 1 from staff s where s.id = staff_id and s.auth_user_id = auth.uid())
    and exists (
      select 1 from notifications n
      where n.id = notification_id
        and (n.business_id = auth_business_id() or is_super_admin())
        and (n.staff_id is null or n.staff_id = notification_reads.staff_id)
    )
  );

-- Tandai semua notifikasi yang terlihat oleh pemanggil sebagai sudah dibaca.
-- SECURITY INVOKER: RLS tetap berlaku, jadi hanya notifikasi yang boleh dilihat pemanggil yang tersentuh
-- (p_business_id hanya mempersempit; super admin boleh bekerja di toko lain).
create or replace function mark_all_notifications_read(p_staff_id uuid, p_business_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  insert into notification_reads (notification_id, staff_id)
  select nt.id, p_staff_id
  from notifications nt
  where nt.business_id = p_business_id
    and (nt.staff_id is null or nt.staff_id = p_staff_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Jumlah notifikasi yang belum dibaca staf tertentu (untuk titik penanda di menu).
create or replace function unread_notification_count(p_staff_id uuid, p_business_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from notifications nt
  where nt.business_id = p_business_id
    and (nt.staff_id is null or nt.staff_id = p_staff_id)
    and not exists (
      select 1 from notification_reads r
      where r.notification_id = nt.id and r.staff_id = p_staff_id
    );
$$;

revoke execute on function mark_all_notifications_read(uuid, uuid) from public, anon;
revoke execute on function unread_notification_count(uuid, uuid) from public, anon;
grant execute on function mark_all_notifications_read(uuid, uuid) to authenticated, service_role;
grant execute on function unread_notification_count(uuid, uuid) to authenticated, service_role;
