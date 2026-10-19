-- 0021_signup.sql
-- Mendukung keputusan produk: self-service signup form untuk tenant baru.
-- Alur: POST /api/auth/signup (admin client, service_role) → insert businesses(status='pending_verification')
--   + insert staff pertama (role='owner') terhubung ke auth.users yang baru dibuat via
--   supabase.auth.admin.createUser({ email: synthetic, password: pin }).
-- Business baru TIDAK bisa dipakai login staf sampai admin (developer) approve lewat
-- Admin Web App (§8 tenant management) yang memanggil approve_business_signup().

create or replace function approve_business_signup(p_business_id uuid) returns void as $$
begin
  if not is_super_admin() then
    raise exception 'Hanya admin (developer) yang boleh menyetujui pendaftaran tenant baru';
  end if;

  update businesses set status = 'active' where id = p_business_id and status = 'pending_verification';

  if not found then
    raise exception 'Business tidak ditemukan atau bukan berstatus pending_verification';
  end if;
end;
$$ language plpgsql security definer;

create or replace function reject_business_signup(p_business_id uuid, p_reason text default null) returns void as $$
begin
  if not is_super_admin() then
    raise exception 'Hanya admin (developer) yang boleh menolak pendaftaran tenant baru';
  end if;

  update businesses set status = 'rejected' where id = p_business_id and status = 'pending_verification';

  if not found then
    raise exception 'Business tidak ditemukan atau bukan berstatus pending_verification';
  end if;
end;
$$ language plpgsql security definer;

-- Index untuk dashboard "daftar tenant menunggu approval" di Admin Web App
create index idx_businesses_pending on businesses (created_at) where status = 'pending_verification';
