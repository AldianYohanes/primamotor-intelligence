-- Koordinat lokasi (toko/gudang). Dipakai asisten chat untuk menyarankan lokasi
-- terdekat dari perangkat staf saat staf tidak menyebut lokasi transaksi.
-- Nullable: lokasi tanpa koordinat tetap bisa dipilih manual, hanya tidak ikut
-- dihitung sebagai "terdekat". RLS tabel locations (0019) berlaku apa adanya.

alter table locations
  add column latitude double precision,
  add column longitude double precision;

alter table locations
  add constraint locations_coordinates_pair
    check ((latitude is null) = (longitude is null)),
  add constraint locations_latitude_range
    check (latitude is null or latitude between -90 and 90),
  add constraint locations_longitude_range
    check (longitude is null or longitude between -180 and 180);
