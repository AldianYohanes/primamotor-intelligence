-- 0033_fix_outbound_stock.sql
--
-- BUG 1 — apply_stock_transaction (0012): setiap transaksi keluar/transfer_out/
-- adjustment_out gagal dengan "violates check constraint stock_check".
-- Trigger lama memakai INSERT ... ON CONFLICT DO UPDATE dengan quantity negatif.
-- Postgres memeriksa CHECK constraint pada baris yang AKAN di-insert sebelum
-- mengecek konflik, jadi baris usulan (quantity = -n) sudah ditolak sebelum
-- sempat menjadi UPDATE. Ditemukan saat menjalankan seed_eval.sql (27 Sep 2026).
-- Perbaikan: mutasi positif tetap upsert, mutasi negatif memakai UPDATE biasa
-- sehingga constraint dicek terhadap saldo hasil akhir.
--
-- BUG 2 — confirm_update_stock / confirm_transfer_stock (0024): transaksi dicatat
-- SEBELUM reservasinya sendiri dilepas. record_stock_transaction mengecek
-- available_quantity (quantity - reserved), sehingga unit yang direservasi oleh
-- transaksi ini dihitung "tidak tersedia" untuk dirinya sendiri. Akibatnya
-- menjual/memindahkan unit terakhir selalu gagal. Perbaikan: lepas reservasi
-- dulu, baru catat. Aman dari race karena UPDATE di release_reservation
-- mengunci baris stock sampai transaksi fungsi selesai.

create or replace function apply_stock_transaction() returns trigger as $$
declare
  v_delta int := case
    when new.transaction_type in ('masuk', 'transfer_in', 'retur', 'adjustment_in') then new.quantity
    when new.transaction_type in ('keluar', 'transfer_out', 'adjustment_out') then -new.quantity
    else new.quantity
  end;
begin
  if v_delta >= 0 then
    insert into stock (business_id, product_id, location_id, quantity, last_updated_at)
    values (new.business_id, new.product_id, new.location_id, v_delta, now())
    on conflict (product_id, location_id)
    do update set
      quantity = stock.quantity + excluded.quantity,
      last_updated_at = now();
  else
    update stock
      set quantity = quantity + v_delta,
          last_updated_at = now()
      where product_id = new.product_id and location_id = new.location_id;
    if not found then
      raise exception 'Belum ada saldo stok untuk produk ini di lokasi tersebut, transaksi keluar ditolak';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function confirm_update_stock(p_audit_log_id uuid, p_staff_id uuid)
returns json as $$
declare
  v_log record;
  v_params jsonb;
  v_direction text;
  v_txn_id uuid;
begin
  select * into v_log from agent_audit_log where id = p_audit_log_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_log.status <> 'pending' then
    return json_build_object('ok', false, 'error', 'not_pending', 'status', v_log.status);
  end if;

  v_params := v_log.input_params;
  v_direction := v_params->>'direction';

  -- Dilepas di luar blok exception: kalau pencatatan gagal, reservasi tetap
  -- lepas (sama seperti perilaku 0024 di jalur gagal).
  if v_direction = 'keluar' then
    perform release_reservation(
      (v_params->>'product_id')::uuid,
      (v_params->>'location_id')::uuid,
      (v_params->>'quantity')::int
    );
  end if;

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
    update agent_audit_log set status = 'failed' where id = p_audit_log_id;
    return json_build_object('ok', false, 'error', SQLERRM);
  end;

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

  perform release_reservation(
    (v_params->>'product_id')::uuid,
    (v_params->>'from_location_id')::uuid,
    (v_params->>'quantity')::int
  );

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
    update agent_audit_log set status = 'failed' where id = p_audit_log_id;
    return json_build_object('ok', false, 'error', SQLERRM);
  end;

  update agent_audit_log
    set status = 'executed',
        confirmed_by = p_staff_id,
        confirmed_at = now()
    where id = p_audit_log_id;

  return json_build_object('ok', true);
end;
$$ language plpgsql;
