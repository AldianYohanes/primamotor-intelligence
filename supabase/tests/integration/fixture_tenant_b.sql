-- Fixture tenant B untuk tes integrasi lintas tenant (hanya DB lokal).
insert into businesses (id, name, slug, status) values
  ('b0000000-0000-0000-0000-00000000b001', 'IT Tenant B', 'it-tenant-b', 'active')
on conflict (id) do nothing;
insert into locations (id, business_id, name, type) values
  ('b0000000-0ca0-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'Gudang B', 'gudang')
on conflict (id) do nothing;
insert into products (id, business_id, part_number, name, min_threshold, unit_cost, selling_price) values
  ('b0000000-0d0c-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'B-001', 'Produk Tenant B', 1, 1000, 2000)
on conflict (id) do nothing;
insert into stock (business_id, product_id, location_id, quantity) values
  ('b0000000-0000-0000-0000-00000000b001', 'b0000000-0d0c-0000-0000-000000000001', 'b0000000-0ca0-0000-0000-000000000001', 10)
on conflict (product_id, location_id) do nothing;
