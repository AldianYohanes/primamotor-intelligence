-- 0020_storage_policies.sql — §8.4
-- Bucket 'receipts', struktur path: receipts/{business_id}/{receipt_import_id}.jpg
-- Policy storage.objects membandingkan segmen pertama path terhadap auth_business_id().

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts read own tenant"
on storage.objects for select
using (
  bucket_id = 'receipts'
  and (
    (storage.foldername(name))[1] = auth_business_id()::text
    or is_super_admin()
  )
);

create policy "receipts upload own tenant"
on storage.objects for insert
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth_business_id()::text
);

create policy "receipts delete full_access own tenant"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth_business_id()::text
  and is_full_access()
);
