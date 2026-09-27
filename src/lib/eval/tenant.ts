/** Tenant khusus evaluasi; halaman /eval hanya berjalan di sini (lihat seed_eval.sql). */
export const EVAL_TENANT_SLUG = "eval-prima-motor";

/**
 * Posisi perangkat tetap selama /eval (= koordinat Toko di seed_eval.sql) supaya
 * hasil tidak bergantung pada GPS/izin browser perangkat uji.
 */
export const EVAL_DEVICE_POSITION = { latitude: -6.2441, longitude: 106.8 };
