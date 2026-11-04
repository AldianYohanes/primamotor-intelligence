-- 0023_stock_reservations.sql — mengaktifkan reserve_stock/release_reservation
-- (0010_stock.sql) yang sejak awal didesain untuk pola HITL ini (lihat komentar
-- "sudah termasuk kuantitas yang direservasi" di record_stock_transaction,
-- 0013_stock_rpc.sql) tapi tidak pernah dipanggil dari Route Handler manapun.
--
-- reserve_stock dipanggil saat agent MENGUSULKAN transaksi keluar/transfer
-- (status 'pending', sebelum PIN), supaya staf lain yang cek stok di jendela
-- waktu itu tidak dikasih kesan stok tersedia penuh padahal sudah "dipegang"
-- transaksi lain yang menunggu konfirmasi.
--
-- KONSEKUENSI yang harus ditutup supaya tidak jadi bug baru (stok "hilang"
-- permanen): reservasi HARUS dilepas persis sekali — baik saat dikonfirmasi
-- (lihat update-stock/confirm & transfer-stock/confirm), ditolak eksplisit
-- (route baru app/api/agent/tools/reject), ATAU dibiarkan begitu saja oleh
-- staf (tutup tab, dsb). Kasus terakhir yang butuh fungsi ini — expire
-- otomatis reservasi 'pending' yang lebih tua dari batas waktu (default 15
-- menit, konsisten dengan LOCKOUT_DURATION_MS PIN di lib/auth/confirm-pin.ts,
-- §8 project instructions), dipanggil "malas" (lazy, bukan cron terpisah) di
-- awal setiap POST update-stock/transfer-stock baru — self-healing tanpa
-- infra tambahan.
create or replace function expire_stale_pending_reservations(p_business_id uuid, p_older_than_minutes int default 15)
returns int as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select id, tool_name, input_params
    from agent_audit_log
    where business_id = p_business_id
      and status = 'pending'
      and tool_name in ('updateStock', 'transferStock')
      and created_at < now() - (p_older_than_minutes || ' minutes')::interval
  loop
    begin
      if v_row.tool_name = 'updateStock' and (v_row.input_params->>'direction') = 'keluar' then
        perform release_reservation(
          (v_row.input_params->>'product_id')::uuid,
          (v_row.input_params->>'location_id')::uuid,
          (v_row.input_params->>'quantity')::int
        );
      elsif v_row.tool_name = 'transferStock' then
        perform release_reservation(
          (v_row.input_params->>'product_id')::uuid,
          (v_row.input_params->>'from_location_id')::uuid,
          (v_row.input_params->>'quantity')::int
        );
      end if;
    exception
      when others then
        -- Baris input_params rusak/tidak lengkap (mis. data lama sebelum migrasi ini) —
        -- tetap tandai expired di bawah supaya tidak nyangkut 'pending' selamanya,
        -- jangan sampai satu baris korup menghentikan loop expire untuk baris lain.
        null;
    end;

    update agent_audit_log
      set status = 'rejected',
          decision_reason = coalesce(decision_reason || ' ', '') || '[auto-expired: tidak dikonfirmasi dalam ' || p_older_than_minutes || ' menit]'
      where id = v_row.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$ language plpgsql;
