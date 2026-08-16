/**
 * Logger terstruktur minimal — satu baris JSON per event, tanpa dependency
 * eksternal (pino/winston dsb sengaja tidak ditambah, konsisten dengan stack
 * yang sudah ada). Vercel mengumpulkan semua stdout/stderr dari Route Handler
 * sebagai log lines; format JSON di sini bikin log itu bisa difilter/di-query
 * di Vercel Log Drains atau dashboard observability lain tanpa parsing regex
 * ke pesan bebas seperti `console.log("Gagal X:", err)`.
 *
 * Prinsip pakai:
 * - `route` WAJIB diisi di setiap panggilan — tanpa ini, log dari 45 route
 *   handler bakal susah dibedakan asalnya cuma dari isi `message`.
 * - Sertakan `business_id`/`staff_id`/`conversation_id` kalau ada di scope
 *   request — ini yang bikin log bisa di-filter per tenant saat investigasi
 *   masalah "staf toko X lapor error", bukan cuma per route.
 * - JANGAN log data sensitif mentah (PIN, isi harga beli/supplier dari OCR,
 *   full input_params transaksi stok) — cukup ID & field yang perlu buat
 *   debug. Kalau butuh detail, log ID row-nya (mis. audit_log_id), bukan
 *   payload lengkapnya.
 * - `logger.error` menerima `error` mentah (unknown) dan otomatis
 *   mengekstrak message/stack kalau itu instance Error — tidak perlu manual
 *   `err instanceof Error ? err.message : String(err)` di tiap Route Handler.
 */

type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  route: string;
  business_id?: string;
  staff_id?: string;
  conversation_id?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info(message: string, context: LogContext) {
    emit("info", message, context);
  },
  warn(message: string, context: LogContext) {
    emit("warn", message, context);
  },
  /**
   * `context.error` (opsional) diterima sebagai `unknown` apa adanya dari
   * blok catch — diekstrak jadi `error_message`/`error_stack` di sini supaya
   * pemanggil tidak perlu narrowing manual tiap kali.
   */
  error(message: string, context: LogContext & { error?: unknown }) {
    const { error, ...rest } = context;
    emit("error", message, {
      ...rest,
      error_message:
        error instanceof Error
          ? error.message
          : error != null
            ? String(error)
            : undefined,
      error_stack: error instanceof Error ? error.stack : undefined,
    });
  },
};
