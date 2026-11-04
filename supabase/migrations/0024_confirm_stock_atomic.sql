-- 0024_confirm_stock_atomic.sql — menutup gap "Confirm route bukan transaksi
-- atomik penuh" (lihat checklist sesi sebelumnya, item #3).
--
-- MASALAH SEBELUMNYA: app/api/agent/tools/update-stock/confirm (dan
-- transfer-stock/confirm) melakukan urutan
--   1. admin.rpc('record_stock_transaction' | 'transfer_stock', ...)
--   2. admin.rpc('release_reservation', ...)
--   3. admin.from('agent_audit_log').update(...)
-- sebagai TIGA panggilan network terpisah dari Route Handler. Kalau proses
-- Next.js crash / koneksi putus di antara langkah 1 dan 3 (mis. setelah stok
-- sudah dipotong tapi sebelum agent_audit_log ditandai 'executed'), baris
-- audit tetap 'pending' padahal stok sudah berubah — retry berikutnya bisa
-- salah asumsi transaksi belum terjadi (idempotency key menyelamatkan dari
-- dobel-catat, tapi status audit log yang salah tetap bikin bingung UI &
-- laporan).
--
-- SOLUSI: bungkus seluruh urutan jadi SATU pemanggilan RPC plpgsql. Karena
-- satu panggilan fungsi = satu unit transaksi dari sudut pandang klien,
-- ini otomatis atomik — tidak perlu BEGIN/COMMIT eksplisit dari Route
-- Handler. Kalau langkah mana pun gagal SETELAH stok berhasil dipotong
-- (mis. update audit_log gagal karena alasan tak terduga), seluruh fungsi
-- di-rollback termasuk perubahan stoknya — ini justru perilaku yang benar
-- (all-or-nothing), bukan cuma "menutup celah pencatatan".
--
-- record_stock_transaction/transfer_stock yang GAGAL karena alasan bisnis
-- normal (mis. stok tidak cukup — meski jarang terjadi di titik ini karena
-- sudah lolos reserve_stock, race condition lain tetap mungkin) DITANGKAP
-- lewat blok exception internal supaya tidak ikut rollback release_reservation
-- & update status 'failed' di bawahnya — pola ini konsisten dengan
-- expire_stale_pending_reservations (0023) yang juga menangkap exception per
-- baris supaya satu kegagalan tidak menggagalkan keseluruhan.

create or replace function confirm_update_stock(p_audit_log_id uuid, p_staff_id uuid)
returns json as $$
declare
  v_log record;
  v_params jsonb;
  v_direction text;
  v_txn_id uuid;
begin
  -- FOR UPDATE mengunci baris audit log supaya dua request confirm yang
  -- kebetulan datang bersamaan (retry dobel-klik / dobel-tab) tidak
  -- sama-sama lolos cek status 'pending' lalu sama-sama mengeksekusi.
  select * into v_log from agent_audit_log where id = p_audit_log_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_log.status <> 'pending' then
    return json_build_object('ok', false, 'error', 'not_pending', 'status', v_log.status);
  end if;

  v_params := v_log.input_params;
  v_direction := v_params->>'direction';

  begin
    v_txn_id := record_stock_transaction(
      p_business_id := (v_params->>'business_id')::uuid,
      p_product_id := (v_params->>'product_id')::uuid,
      p_location_id := (v_params->>'location_id')::uuid,
      p_type := v_direction::transaction_type,
      p_quantity := (v_params->>'quantity')::int,
      p_staff_id := p_staff_id,
      p_audit_log_id := p_audit_log_id,
      p_idempotency_key := p_audit_log_id::text
    );
  exception when others then
    -- Reservasi tetap harus dilepas di jalur gagal juga — sama seperti pola
    -- lama di update-stock/confirm (route.ts versi sebelumnya).
    if v_direction = 'keluar' then
      perform release_reservation(
        (v_params->>'product_id')::uuid,
        (v_params->>'location_id')::uuid,
        (v_params->>'quantity')::int
      );
    end if;
    update agent_audit_log set status = 'failed' where id = p_audit_log_id;
    return json_build_object('ok', false, 'error', SQLERRM);
  end;

  if v_direction = 'keluar' then
    perform release_reservation(
      (v_params->>'product_id')::uuid,
      (v_params->>'location_id')::uuid,
      (v_params->>'quantity')::int
    );
  end if;

  update agent_audit_log
    set status = 'executed',
        confirmed_by = p_staff_id,
        confirmed_at = now(),
        related_transaction_id = v_txn_id
    where id = p_audit_log_id;

  return json_build_object('ok', true, 'transaction_id', v_txn_id);
end;
$$ language plpgsql;

create or replace function confirm_transfer_stock(p_audit_log_id uuid, p_staff_id uuid)
returns json as $$
declare
  v_log record;
  v_params jsonb;
begin
  select * into v_log from agent_audit_log where id = p_audit_log_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_log.status <> 'pending' then
    return json_build_object('ok', false, 'error', 'not_pending', 'status', v_log.status);
  end if;

  v_params := v_log.input_params;

  begin
    perform transfer_stock(
      p_business_id := (v_params->>'business_id')::uuid,
      p_product_id := (v_params->>'product_id')::uuid,
      p_quantity := (v_params->>'quantity')::int,
      p_from_location_id := (v_params->>'from_location_id')::uuid,
      p_to_location_id := (v_params->>'to_location_id')::uuid,
      p_staff_id := p_staff_id,
      p_audit_log_id := p_audit_log_id,
      p_idempotency_key := p_audit_log_id::text
    );
  exception when others then
    perform release_reservation(
      (v_params->>'product_id')::uuid,
      (v_params->>'from_location_id')::uuid,
      (v_params->>'quantity')::int
    );
    update agent_audit_log set status = 'failed' where id = p_audit_log_id;
    return json_build_object('ok', false, 'error', SQLERRM);
  end;

  perform release_reservation(
    (v_params->>'product_id')::uuid,
    (v_params->>'from_location_id')::uuid,
    (v_params->>'quantity')::int
  );

  update agent_audit_log
    set status = 'executed',
        confirmed_by = p_staff_id,
        confirmed_at = now()
    where id = p_audit_log_id;

  return json_build_object('ok', true);
end;
$$ language plpgsql;
